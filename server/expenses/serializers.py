from rest_framework import serializers
from django.contrib.auth.models import User
from django.db import transaction
from decimal import Decimal
from django.db.models import Q
from .models import Profile, Group, GroupMembership, Expense, ExpenseSplit, Payment, ImportBatch, ImportAnomaly

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ['display_name']

class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source='profile.display_name', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'display_name']

class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    display_name = serializers.CharField(max_length=150)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def create(self, validated_data):
        with transaction.atomic():
            user = User.objects.create_user(
                username=validated_data['username'],
                password=validated_data['password']
            )
            Profile.objects.create(user=user, display_name=validated_data['display_name'])
            return user

class GroupMembershipSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True
    )

    class Meta:
        model = GroupMembership
        fields = ['id', 'user', 'user_id', 'joined_at', 'left_at']

class GroupSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    memberships = GroupMembershipSerializer(many=True, read_only=True)

    class Meta:
        model = Group
        fields = ['id', 'name', 'created_at', 'created_by', 'memberships']

class ExpenseSplitSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True
    )

    class Meta:
        model = ExpenseSplit
        fields = ['id', 'user', 'user_id', 'share_amount', 'share_percentage']
        extra_kwargs = {
            'share_amount': {'required': False},
        }

class ExpenseSerializer(serializers.ModelSerializer):
    splits = ExpenseSplitSerializer(many=True, read_only=True)
    paid_by_detail = UserSerializer(source='paid_by', read_only=True)
    
    # Optional input fields for custom creation logic
    split_among = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True
    )
    splits_input = serializers.ListField(
        child=serializers.DictField(), required=False, write_only=True, source='splits'
    )

    class Meta:
        model = Expense
        fields = [
            'id', 'group', 'description', 'date', 'paid_by', 'paid_by_detail',
            'currency', 'original_amount', 'converted_amount', 'exchange_rate_used',
            'split_type', 'is_reversal', 'reversed_expense', 'source',
            'import_batch', 'raw_csv_row', 'is_deleted', 'created_at',
            'splits', 'split_among', 'splits_input'
        ]
        extra_kwargs = {
            'converted_amount': {'read_only': True},
            'exchange_rate_used': {'required': False, 'allow_null': True},
        }

    def validate(self, data):
        group = data.get('group')
        date = data.get('date')
        split_type = data.get('split_type')
        original_amount = data.get('original_amount')
        source = data.get('source', Expense.SourceChoices.MANUAL)
        
        split_among = data.get('split_among', None)
        splits_input = data.get('splits', None)  # mapped to source='splits'

        # Check membership date active rules, skip for csv_import source
        if source != Expense.SourceChoices.CSV_IMPORT:
            active_member_ids = set(GroupMembership.objects.filter(
                group=group,
                joined_at__lte=date
            ).filter(
                Q(left_at__isnull=True) | Q(left_at__gte=date)
            ).values_list('user_id', flat=True))

            paid_by = data.get('paid_by')
            if paid_by.id not in active_member_ids:
                raise serializers.ValidationError(
                    f"Payer '{paid_by.username}' was not an active member of the group on the expense date ({date})."
                )

            if split_type == Expense.SplitTypeChoices.EQUAL:
                if not split_among:
                    raise serializers.ValidationError("split_among user ID list is required for equal splits.")
                for uid in split_among:
                    if uid not in active_member_ids:
                        user_obj = User.objects.get(id=uid)
                        raise serializers.ValidationError(
                            f"User '{user_obj.username}' was not an active member on the expense date ({date})."
                        )
            else:
                if not splits_input:
                    raise serializers.ValidationError("splits data is required for unequal or percentage splits.")
                for split in splits_input:
                    uid = split.get('user_id')
                    if isinstance(uid, User):
                        uid = uid.id
                    if uid not in active_member_ids:
                        user_obj = User.objects.get(id=uid)
                        raise serializers.ValidationError(
                            f"User '{user_obj.username}' was not an active member on the expense date ({date})."
                        )

        # Validate sums based on split type
        if split_type == Expense.SplitTypeChoices.UNEQUAL:
            if not splits_input:
                raise serializers.ValidationError("splits is required for unequal split type.")
            total_sum = sum(Decimal(str(s.get('amount', 0))) for s in splits_input)
            if abs(total_sum - Decimal(str(original_amount))) > Decimal('0.01'):
                raise serializers.ValidationError(
                    f"Sum of splits ({total_sum}) must equal original amount ({original_amount})."
                )
        elif split_type == Expense.SplitTypeChoices.PERCENTAGE:
            if not splits_input:
                raise serializers.ValidationError("splits is required for percentage split type.")
            total_pct = sum(Decimal(str(s.get('percentage', 0))) for s in splits_input)
            if abs(total_pct - Decimal('100.0')) > Decimal('0.01'):
                raise serializers.ValidationError(
                    f"Sum of percentages ({total_pct}%) must equal 100%."
                )

        return data

    def create(self, validated_data):
        from django.conf import settings
        
        split_among = validated_data.pop('split_among', None)
        splits_input = validated_data.pop('splits', None)

        original_amount = Decimal(str(validated_data['original_amount']))
        currency = validated_data.get('currency', Expense.CurrencyChoices.INR)
        exchange_rate = validated_data.get('exchange_rate_used', None)

        if currency == Expense.CurrencyChoices.USD:
            if not exchange_rate:
                exchange_rate = Decimal(str(getattr(settings, 'USD_TO_INR_RATE', 83.0)))
            converted_amount = (original_amount * exchange_rate).quantize(Decimal('0.01'))
        else:
            exchange_rate = None
            converted_amount = original_amount.quantize(Decimal('0.01'))

        validated_data['converted_amount'] = converted_amount
        validated_data['exchange_rate_used'] = exchange_rate

        with transaction.atomic():
            expense = Expense.objects.create(**validated_data)
            split_type = expense.split_type

            def round_amount(val):
                return Decimal(str(val)).quantize(Decimal('0.01'))

            if split_type == Expense.SplitTypeChoices.EQUAL:
                num_users = len(split_among)
                base_share = round_amount(converted_amount / Decimal(str(num_users)))
                total_shares = base_share * num_users
                remainder = converted_amount - total_shares
                
                splits = []
                for index, uid in enumerate(split_among):
                    splits.append({
                        'user_id': uid,
                        'share_amount': base_share,
                        'share_percentage': round_amount(Decimal('100.0') / Decimal(str(num_users)))
                    })
                
                # Apply remainder to payer if they are in the split, otherwise to the first user
                if remainder != Decimal('0.00'):
                    payer_split = next((s for s in splits if s['user_id'] == expense.paid_by_id), None)
                    if payer_split:
                        payer_split['share_amount'] += remainder
                    else:
                        splits[0]['share_amount'] += remainder

                for s in splits:
                    ExpenseSplit.objects.create(
                        expense=expense,
                        user_id=s['user_id'],
                        share_amount=s['share_amount'],
                        share_percentage=s['share_percentage']
                    )

            elif split_type == Expense.SplitTypeChoices.UNEQUAL:
                splits = []
                total_converted_split_sum = Decimal('0.00')
                for split in splits_input:
                    uid = split['user_id']
                    if isinstance(uid, User):
                        uid = uid.id
                    orig_share = Decimal(str(split['amount']))
                    
                    if currency == Expense.CurrencyChoices.USD:
                        share_in_inr = round_amount(orig_share * exchange_rate)
                    else:
                        share_in_inr = round_amount(orig_share)
                        
                    total_converted_split_sum += share_in_inr
                    percentage = round_amount((orig_share / original_amount) * Decimal('100.0'))
                    
                    splits.append({
                        'user_id': uid,
                        'share_amount': share_in_inr,
                        'share_percentage': percentage
                    })

                # Adjust rounding remainder
                remainder = converted_amount - total_converted_split_sum
                if remainder != Decimal('0.00'):
                    payer_split = next((s for s in splits if s['user_id'] == expense.paid_by_id), None)
                    if payer_split:
                        payer_split['share_amount'] += remainder
                    else:
                        splits[0]['share_amount'] += remainder

                for s in splits:
                    ExpenseSplit.objects.create(
                        expense=expense,
                        user_id=s['user_id'],
                        share_amount=s['share_amount'],
                        share_percentage=s['share_percentage']
                    )

            elif split_type == Expense.SplitTypeChoices.PERCENTAGE:
                splits = []
                total_converted_split_sum = Decimal('0.00')
                for split in splits_input:
                    uid = split['user_id']
                    if isinstance(uid, User):
                        uid = uid.id
                    percentage = Decimal(str(split['percentage']))
                    
                    share_in_inr = round_amount(converted_amount * (percentage / Decimal('100.0')))
                    total_converted_split_sum += share_in_inr
                    
                    splits.append({
                        'user_id': uid,
                        'share_amount': share_in_inr,
                        'share_percentage': percentage
                    })

                # Adjust rounding remainder
                remainder = converted_amount - total_converted_split_sum
                if remainder != Decimal('0.00'):
                    payer_split = next((s for s in splits if s['user_id'] == expense.paid_by_id), None)
                    if payer_split:
                        payer_split['share_amount'] += remainder
                    else:
                        splits[0]['share_amount'] += remainder

                for s in splits:
                    ExpenseSplit.objects.create(
                        expense=expense,
                        user_id=s['user_id'],
                        share_amount=s['share_amount'],
                        share_percentage=s['share_percentage']
                    )

            return expense

class PaymentSerializer(serializers.ModelSerializer):
    paid_by_detail = UserSerializer(source='paid_by', read_only=True)
    paid_to_detail = UserSerializer(source='paid_to', read_only=True)

    class Meta:
        model = Payment
        fields = [
            'id', 'group', 'paid_by', 'paid_by_detail', 'paid_to', 'paid_to_detail',
            'amount', 'date', 'note', 'source', 'import_batch', 'raw_csv_row'
        ]

    def validate(self, data):
        group = data.get('group')
        date = data.get('date')
        paid_by = data.get('paid_by')
        paid_to = data.get('paid_to')

        if paid_by == paid_to:
            raise serializers.ValidationError("Payer and receiver cannot be the same user.")

        # Check membership date active rules
        active_member_ids = set(GroupMembership.objects.filter(
            group=group,
            joined_at__lte=date
        ).filter(
            Q(left_at__isnull=True) | Q(left_at__gte=date)
        ).values_list('user_id', flat=True))

        if paid_by.id not in active_member_ids:
            raise serializers.ValidationError(
                f"Payer '{paid_by.username}' was not an active member of this group on the payment date ({date})."
            )
        if paid_to.id not in active_member_ids:
            raise serializers.ValidationError(
                f"Receiver '{paid_to.username}' was not an active member of this group on the payment date ({date})."
            )

        return data
