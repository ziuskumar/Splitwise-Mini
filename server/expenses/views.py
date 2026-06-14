from rest_framework import viewsets, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from django.contrib.auth.models import User
from django.utils import timezone
from django.db.models import Q
from django.db import transaction
from rest_framework_simplejwt.tokens import RefreshToken
from decimal import Decimal

from .models import Group, GroupMembership, Expense, ExpenseSplit, Payment, Profile, ImportBatch, ImportAnomaly
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
        
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }, status=status.HTTP_201_CREATED)

class GroupViewSet(viewsets.ModelViewSet):
    serializer_class = GroupSerializer

    def get_queryset(self):
        return Group.objects.filter(memberships__user=self.request.user).distinct()

    def perform_create(self, serializer):
        group = serializer.save(created_by=self.request.user)
        GroupMembership.objects.create(
            group=group,
            user=self.request.user,
            joined_at=timezone.now().date()
        )

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

    @action(detail=True, methods=['get', 'post'], url_path='expenses')
    def group_expenses(self, request, pk=None):
        group = self.get_object()
        if request.method == 'GET':
            expenses = Expense.objects.filter(group=group, is_deleted=False).prefetch_related('splits__user')
            
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

    @action(detail=True, methods=['get'], url_path='balances')
    def group_balances(self, request, pk=None):
        group = self.get_object()
        today = timezone.now().date()
        
        memberships = GroupMembership.objects.filter(
            group=group,
            joined_at__lte=today
        ).filter(
            Q(left_at__isnull=True) | Q(left_at__gte=today)
        ).select_related('user__profile')
        
        current_members = [m.user for m in memberships]
        
        expenses = Expense.objects.filter(group=group, is_deleted=False).prefetch_related('splits')
        payments = Payment.objects.filter(group=group)
        
        all_balances = {}
        all_memberships = GroupMembership.objects.filter(group=group).select_related('user')
        for m in all_memberships:
            all_balances[m.user.id] = Decimal('0.00')

        for exp in expenses:
            p_id = exp.paid_by_id
            if p_id not in all_balances:
                all_balances[p_id] = Decimal('0.00')
            all_balances[p_id] += exp.converted_amount
            
            for split in exp.splits.all():
                u_id = split.user_id
                if u_id not in all_balances:
                    all_balances[u_id] = Decimal('0.00')
                all_balances[u_id] -= split.share_amount

        for pay in payments:
            payer_id = pay.paid_by_id
            receiver_id = pay.paid_to_id
            if payer_id not in all_balances:
                all_balances[payer_id] = Decimal('0.00')
            if receiver_id not in all_balances:
                all_balances[receiver_id] = Decimal('0.00')
                
            all_balances[payer_id] += pay.amount
            all_balances[receiver_id] -= pay.amount

        response_data = []
        for member in current_members:
            net_val = all_balances.get(member.id, Decimal('0.00'))
            response_data.append({
                'user': UserSerializer(member).data,
                'net_balance': float(net_val)
            })
            
        return Response(response_data)

    @action(detail=True, methods=['get'], url_path=r'balances/(?P<user_id>[^/.]+)/detail')
    def balance_detail(self, request, pk=None, user_id=None):
        group = self.get_object()
        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        expenses = Expense.objects.filter(
            group=group,
            is_deleted=False
        ).filter(
            Q(paid_by=target_user) | Q(splits__user=target_user)
        ).prefetch_related('splits__user', 'paid_by__profile').distinct().order_by('date')

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

    # POST /api/groups/:id/import/
    @action(detail=True, methods=['post'], url_path='import')
    def import_csv(self, request, pk=None):
        group = self.get_object()
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"detail": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)
            
        from .services.csv_importer import CSVImporter
        importer = CSVImporter(group=group, uploaded_by=request.user, filename=file_obj.name)
        result = importer.import_csv_data(file_obj)
        return Response(result, status=status.HTTP_201_CREATED)

class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save()

class ImportBatchViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ImportBatch.objects.all()

    # GET /api/import-batches/:id/report/
    @action(detail=True, methods=['get'], url_path='report')
    def report(self, request, pk=None):
        batch = self.get_object()
        anomalies = ImportAnomaly.objects.filter(import_batch=batch).order_by('csv_row_number')
        
        anomaly_list = []
        for anom in anomalies:
            anomaly_list.append({
                'id': anom.id,
                'csv_row_number': anom.csv_row_number,
                'raw_row_data': anom.raw_row_data,
                'anomaly_type': anom.anomaly_type,
                'description': anom.description,
                'action_taken': anom.action_taken,
                'status': anom.status,
                'resolved_by': anom.resolved_by.username if anom.resolved_by else None,
                'resolved_at': str(anom.resolved_at) if anom.resolved_at else None
            })
            
        expenses_created = Expense.objects.filter(import_batch=batch, is_deleted=False).count()
        payments_created = Payment.objects.filter(import_batch=batch).count()
        needs_review_count = anomalies.filter(status=ImportAnomaly.StatusChoices.NEEDS_REVIEW).count()
        auto_resolved_count = anomalies.count() - needs_review_count

        return Response({
            'id': batch.id,
            'filename': batch.filename,
            'uploaded_at': str(batch.uploaded_at),
            'uploaded_by': batch.uploaded_by.username,
            'status': batch.status,
            'summary': {
                'total_rows_processed': len(anomaly_list) + expenses_created + payments_created,
                'auto_resolved_count': auto_resolved_count,
                'needs_review_count': needs_review_count,
                'expenses_created': expenses_created,
                'payments_created': payments_created
            },
            'anomalies': anomaly_list
        })

    # GET /api/import-batches/:id/anomalies/?status=needs_review
    @action(detail=True, methods=['get'], url_path='anomalies')
    def anomalies(self, request, pk=None):
        batch = self.get_object()
        status_filter = request.query_params.get('status')
        qs = ImportAnomaly.objects.filter(import_batch=batch)
        if status_filter:
            qs = qs.filter(status=status_filter)
            
        anomaly_list = []
        for anom in qs.order_by('csv_row_number'):
            anomaly_list.append({
                'id': anom.id,
                'csv_row_number': anom.csv_row_number,
                'raw_row_data': anom.raw_row_data,
                'anomaly_type': anom.anomaly_type,
                'description': anom.description,
                'action_taken': anom.action_taken,
                'status': anom.status
            })
        return Response(anomaly_list)

class ImportAnomalyViewSet(viewsets.GenericViewSet):
    queryset = ImportAnomaly.objects.all()

    # POST /api/anomalies/:id/resolve/
    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, pk=None):
        anomaly = self.get_object()
        action_type = request.data.get('action')
        
        if action_type not in ['approve', 'reject', 'merge_duplicate', 'manual_split']:
            return Response(
                {"detail": "Invalid action. Must be 'approve', 'reject', 'merge_duplicate', or 'manual_split'."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        batch = anomaly.import_batch
        
        expense = Expense.objects.filter(import_batch=batch, raw_csv_row=anomaly.raw_row_data).first()
        payment = Payment.objects.filter(import_batch=batch, raw_csv_row=anomaly.raw_row_data).first()
        
        with transaction.atomic():
            if action_type == 'reject':
                if expense:
                    expense.is_deleted = True
                    expense.save()
                anomaly.action_taken += f" | Resolved via Reject: Marked expense as deleted."
                
            elif action_type == 'approve':
                anomaly.action_taken += " | Resolved via Approve: Confirmed import."
                
            elif action_type == 'merge_duplicate':
                if expense:
                    expense.is_deleted = True
                    expense.save()
                anomaly.action_taken += f" | Resolved via Merge: Deleted duplicate expense."
                
            elif action_type == 'manual_split':
                manual_data = request.data.get('manual_split')
                if not manual_data or 'splits' not in manual_data:
                    return Response(
                        {"detail": "splits details required for manual_split action."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                if not expense:
                    return Response(
                        {"detail": "No expense record found for manual split resolution."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                    
                expense.splits.all().delete()
                splits_list = manual_data['splits']
                
                total_sum = sum(Decimal(str(s.get('amount', 0))) for s in splits_list)
                if abs(total_sum - expense.converted_amount) > Decimal('0.01'):
                    return Response(
                        {"detail": f"Sum of splits ({total_sum}) must equal converted amount ({expense.converted_amount})."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                    
                for s in splits_list:
                    uid = s['user_id']
                    amt = Decimal(str(s['amount']))
                    pct = Decimal(str(s.get('percentage', 0))) or ((amt / expense.converted_amount) * Decimal('100.0'))
                    
                    ExpenseSplit.objects.create(
                        expense=expense,
                        user_id=uid,
                        share_amount=amt.quantize(Decimal('0.01')),
                        share_percentage=Decimal(str(pct)).quantize(Decimal('0.01'))
                    )
                expense.split_type = Expense.SplitTypeChoices.UNEQUAL
                expense.save()
                anomaly.action_taken += " | Resolved via Manual Split: Overwrote allocations."
                
            anomaly.status = ImportAnomaly.StatusChoices.APPROVED
            anomaly.resolved_by = request.user
            anomaly.resolved_at = timezone.now()
            anomaly.save()
            
        return Response({
            'id': anomaly.id,
            'status': anomaly.status,
            'action_taken': anomaly.action_taken,
            'resolved_by': anomaly.resolved_by.username,
            'resolved_at': str(anomaly.resolved_at)
        })
