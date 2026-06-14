from rest_framework import viewsets, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from django.contrib.auth.models import User
from django.utils import timezone
from django.db.models import Q
from rest_framework_simplejwt.tokens import RefreshToken
from decimal import Decimal

from .models import Group, GroupMembership, Expense, ExpenseSplit, Payment, Profile
from .serializers import (
    RegisterSerializer, UserSerializer, GroupSerializer,
    GroupMembershipSerializer, ExpenseSerializer, PaymentSerializer
)

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        # Generate tokens
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }, status=status.HTTP_201_CREATED)

class GroupViewSet(viewsets.ModelViewSet):
    serializer_class = GroupSerializer

    def get_queryset(self):
        # List groups where the authenticated user is or was a member
        return Group.objects.filter(memberships__user=self.request.user).distinct()

    def perform_create(self, serializer):
        # Save group and auto-add creator as an active member today
        group = serializer.save(created_by=self.request.user)
        GroupMembership.objects.create(
            group=group,
            user=self.request.user,
            joined_at=timezone.now().date()
        )

    # POST /api/groups/:id/members/
    @action(detail=True, methods=['post'], url_path='members')
    def add_member(self, request, pk=None):
        group = self.get_object()
        serializer = GroupMembershipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = serializer.validated_data['user']
        if GroupMembership.objects.filter(group=group, user=user).exists():
            return Response(
                {"detail": f"User '{user.username}' is already a member of this group."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        serializer.save(group=group)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # PATCH /api/groups/:id/members/:membership_id/
    @action(detail=True, methods=['patch'], url_path=r'members/(?P<membership_id>[^/.]+)')
    def update_member(self, request, pk=None, membership_id=None):
        group = self.get_object()
        try:
            membership = GroupMembership.objects.get(id=membership_id, group=group)
        except GroupMembership.DoesNotExist:
            return Response({"detail": "Membership record not found."}, status=status.HTTP_404_NOT_FOUND)
            
        serializer = GroupMembershipSerializer(membership, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    # GET /api/groups/:id/expenses/ and POST /api/groups/:id/expenses/
    @action(detail=True, methods=['get', 'post'], url_path='expenses')
    def group_expenses(self, request, pk=None):
        group = self.get_object()
        if request.method == 'GET':
            # List only non-deleted expenses
            expenses = Expense.objects.filter(group=group, is_deleted=False).prefetch_related('splits__user')
            
            # Filtering
            start_date = request.query_params.get('start_date')
            end_date = request.query_params.get('end_date')
            member_id = request.query_params.get('member_id')
            
            if start_date:
                expenses = expenses.filter(date__gte=start_date)
            if end_date:
                expenses = expenses.filter(date__lte=end_date)
            if member_id:
                expenses = expenses.filter(
                    Q(paid_by_id=member_id) | Q(splits__user_id=member_id)
                ).distinct()
                
            serializer = ExpenseSerializer(expenses.order_by('-date'), many=True)
            return Response(serializer.data)
            
        elif request.method == 'POST':
            data = request.data.copy()
            data['group'] = group.id
            serializer = ExpenseSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)

    # GET /api/groups/:id/payments/ and POST /api/groups/:id/payments/
    @action(detail=True, methods=['get', 'post'], url_path='payments')
    def group_payments(self, request, pk=None):
        group = self.get_object()
        if request.method == 'GET':
            payments = Payment.objects.filter(group=group).prefetch_related('paid_by', 'paid_to')
            serializer = PaymentSerializer(payments.order_by('-date'), many=True)
            return Response(serializer.data)
        elif request.method == 'POST':
            data = request.data.copy()
            data['group'] = group.id
            serializer = PaymentSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)

    # GET /api/groups/:id/balances/
    @action(detail=True, methods=['get'], url_path='balances')
    def group_balances(self, request, pk=None):
        group = self.get_object()
        today = timezone.now().date()
        
        # Get all current group members (joined_at <= today and (left_at is null or left_at >= today))
        memberships = GroupMembership.objects.filter(
            group=group,
            joined_at__lte=today
        ).filter(
            Q(left_at__isnull=True) | Q(left_at__gte=today)
        ).select_related('user__profile')
        
        current_members = [m.user for m in memberships]
        
        # Fetch non-deleted expenses and payments
        expenses = Expense.objects.filter(group=group, is_deleted=False).prefetch_related('splits')
        payments = Payment.objects.filter(group=group)
        
        # Initialize balances for all group members (past and present)
        all_balances = {}
        all_memberships = GroupMembership.objects.filter(group=group).select_related('user')
        for m in all_memberships:
            all_balances[m.user.id] = Decimal('0.00')

        # Add amounts paid for expenses
        for exp in expenses:
            p_id = exp.paid_by_id
            if p_id not in all_balances:
                all_balances[p_id] = Decimal('0.00')
            all_balances[p_id] += exp.converted_amount
            
            # Subtract split shares
            for split in exp.splits.all():
                u_id = split.user_id
                if u_id not in all_balances:
                    all_balances[u_id] = Decimal('0.00')
                all_balances[u_id] -= split.share_amount

        # Add/subtract settlement payments
        for pay in payments:
            payer_id = pay.paid_by_id
            receiver_id = pay.paid_to_id
            if payer_id not in all_balances:
                all_balances[payer_id] = Decimal('0.00')
            if receiver_id not in all_balances:
                all_balances[receiver_id] = Decimal('0.00')
                
            all_balances[payer_id] += pay.amount
            all_balances[receiver_id] -= pay.amount

        # Return balances formatted for current members only
        response_data = []
        for member in current_members:
            net_val = all_balances.get(member.id, Decimal('0.00'))
            response_data.append({
                'user': UserSerializer(member).data,
                'net_balance': float(net_val)
            })
            
        return Response(response_data)

    # GET /api/groups/:id/balances/:user_id/detail/
    @action(detail=True, methods=['get'], url_path=r'balances/(?P<user_id>[^/.]+)/detail')
    def balance_detail(self, request, pk=None, user_id=None):
        group = self.get_object()
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        # Get expenses where user paid or was split into
        expenses = Expense.objects.filter(
            group=group,
            is_deleted=False
        ).filter(
            Q(paid_by=target_user) | Q(splits__user=target_user)
        ).prefetch_related('splits__user', 'paid_by__profile').distinct().order_by('date')

        # Get payments involving this user
        payments = Payment.objects.filter(
            group=group
        ).filter(
            Q(paid_by=target_user) | Q(paid_to=target_user)
        ).select_related('paid_by__profile', 'paid_to__profile').order_by('date')

        itemized_expenses = []
        for exp in expenses:
            user_split = exp.splits.filter(user=target_user).first()
            user_share = float(user_split.share_amount) if user_split else 0.0
            paid_by_user = (exp.paid_by_id == target_user.id)
            
            itemized_expenses.append({
                'id': exp.id,
                'description': exp.description,
                'date': str(exp.date),
                'original_amount': float(exp.original_amount),
                'currency': exp.currency,
                'converted_amount': float(exp.converted_amount),
                'paid_by_me': paid_by_user,
                'paid_by_username': exp.paid_by.username,
                'paid_by_display_name': exp.paid_by.profile.display_name,
                'my_share_amount': user_share,
                'my_share_percentage': float(user_split.share_percentage) if (user_split and user_split.share_percentage) else None,
                'split_type': exp.split_type
            })

        itemized_payments = []
        for pay in payments:
            itemized_payments.append({
                'id': pay.id,
                'date': str(pay.date),
                'amount': float(pay.amount),
                'note': pay.note,
                'paid_by_me': (pay.paid_by_id == target_user.id),
                'paid_by_username': pay.paid_by.username,
                'paid_by_display_name': pay.paid_by.profile.display_name,
                'paid_to_username': pay.paid_to.username,
                'paid_to_display_name': pay.paid_to.profile.display_name,
            })

        # Calculations
        total_paid = sum(exp['converted_amount'] for exp in itemized_expenses if exp['paid_by_me'])
        total_owed = sum(exp['my_share_amount'] for exp in itemized_expenses)
        total_sent = sum(pay['amount'] for pay in itemized_payments if pay['paid_by_me'])
        total_received = sum(pay['amount'] for pay in itemized_payments if not pay['paid_by_me'])
        net_balance = total_paid - total_owed + total_sent - total_received

        return Response({
            'user': UserSerializer(target_user).data,
            'itemized_expenses': itemized_expenses,
            'itemized_payments': itemized_payments,
            'summary': {
                'total_paid_for_expenses': total_paid,
                'total_my_shares': total_owed,
                'total_payments_sent': total_sent,
                'total_payments_received': total_received,
                'computed_net_balance': net_balance
            }
        })

class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer

    def perform_destroy(self, instance):
        # Soft delete financial records
        instance.is_deleted = True
        instance.save()
