import csv
import io
import re
import logging
import difflib
import json
from datetime import datetime
from decimal import Decimal
from django.db import transaction
from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from django.db.models import Q

from ..models import (
    Profile, Group, GroupMembership, Expense, ExpenseSplit,
    Payment, ImportBatch, ImportAnomaly
)
from .llm_split_parser import call_llm_for_split_parsing

logger = logging.getLogger(__name__)

class CSVImporter:
    ALIAS_MAP = {
        'aisha': 'aisha',
        'aisha m': 'aisha',
        'priya': 'priya',
        'priya s': 'priya',
        'rohan': 'rohan',
        'meera': 'meera',
        'dev': 'dev',
        'sam': 'sam'
    }

    def __init__(self, group, uploaded_by, filename):
        self.group = group
        self.uploaded_by = uploaded_by
        self.filename = filename
        self.last_seen_year = 2026  # Default fallback year for chronological inference

    def _get_or_create_user(self, name_str):
        name_clean = name_str.strip().lower()
        canonical_username = self.ALIAS_MAP.get(name_clean, name_clean)
        
        # Determine if alias resolution was applied
        alias_applied = (name_clean != canonical_username)

        user, created = User.objects.get_or_create(
            username=canonical_username,
            defaults={'is_active': True}
        )
        if created:
            user.set_password('Pass123!')  # Default temporary password
            user.save()
            # Create profile
            Profile.objects.create(user=user, display_name=canonical_username.capitalize())
            
        # Ensure profile exists
        if not hasattr(user, 'profile'):
            Profile.objects.create(user=user, display_name=user.username.capitalize())
            
        # Ensure user is a member of the group
        membership, m_created = GroupMembership.objects.get_or_create(
            group=self.group,
            user=user,
            defaults={'joined_at': datetime(2026, 1, 1).date()}
        )
        
        return user, alias_applied

    def _normalize_date(self, date_str):
        date_str = date_str.strip()
        anomalies = []
        
        # 1. Check ISO Format (YYYY-MM-DD)
        if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            parsed = datetime.strptime(date_str, '%Y-%m-%d').date()
            self.last_seen_year = parsed.year
            return parsed, anomalies

        # 2. Check Slash Format (DD/MM/YYYY)
        if re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', date_str):
            parsed = datetime.strptime(date_str, '%d/%m/%Y').date()
            self.last_seen_year = parsed.year
            anomalies.append('DATE_FORMAT_AMBIGUOUS')
            return parsed, anomalies

        # 3. Check Bare Month & Day format (e.g. "Mar 14", "14 Mar")
        for fmt in ('%b %d', '%d %b', '%B %d', '%d %B'):
            try:
                parsed = datetime.strptime(date_str, fmt).date()
                inferred_date = parsed.replace(year=self.last_seen_year)
                anomalies.append('DATE_MISSING_YEAR')
                return inferred_date, anomalies
            except ValueError:
                continue

        raise ValueError(f"Unparseable date format: {date_str}")

    def _clean_amount(self, amount_str):
        amount_str = amount_str.strip()
        anomalies = []
        if ',' in amount_str:
            amount_str = amount_str.replace(',', '')
            anomalies.append('AMOUNT_FORMAT_CLEANED')
        
        try:
            # Handle parenthesis negative values if any, or standard sign
            if amount_str.startswith('(') and amount_str.endswith(')'):
                amount = -float(amount_str[1:-1])
            else:
                amount = float(amount_str)
            return amount, anomalies
        except ValueError:
            raise ValueError(f"Unparseable amount string: {amount_str}")

    def _clean_currency(self, currency_str, amount):
        currency_str = currency_str.strip().upper() if currency_str else ""
        anomalies = []
        
        if not currency_str:
            currency = 'INR'
            anomalies.append('CURRENCY_MISSING')
        else:
            currency = currency_str

        rate = Decimal(str(getattr(settings, 'USD_TO_INR_RATE', 83.0)))
        original_amount = Decimal(str(amount))

        if currency == 'USD':
            converted_amount = (original_amount * rate).quantize(Decimal('0.01'))
            anomalies.append('CURRENCY_CONVERSION_APPLIED')
            exchange_rate_used = rate
        else:
            converted_amount = original_amount.quantize(Decimal('0.01'))
            exchange_rate_used = None
            
        return currency, original_amount, converted_amount, exchange_rate_used, anomalies

    def _detect_settlement(self, row, paid_by_user):
        """
        Detect settlement misclassification based on blank split_type
        and description matching '<Name> paid <Name>' or notes mentioning 'settlement'
        """
        description = row.get('description', '').strip()
        notes = row.get('notes', '').strip()
        split_type = row.get('split_type', '').strip()

        if split_type:
            return None

        is_settlement = False
        target_username = None

        if 'settlement' in notes.lower() or 'settlement' in description.lower():
            is_settlement = True

        # Check description pattern: '<Name> paid <Name>'
        match = re.match(r'^(\w+)\s+paid\s+(\w+)', description, re.IGNORECASE)
        if match:
            is_settlement = True
            payer_part = match.group(1).lower()
            receiver_part = match.group(2).lower()
            canonical_receiver = self.ALIAS_MAP.get(receiver_part, receiver_part)
            try:
                target_user = User.objects.get(username=canonical_receiver)
                target_username = target_user.username
            except User.DoesNotExist:
                target_user, _ = self._get_or_create_user(receiver_part)
                target_username = target_user.username

        # Alternate: description: 'paid <Name>'
        if not target_username:
            match_alt = re.match(r'^paid\s+(\w+)', description, re.IGNORECASE)
            if match_alt:
                is_settlement = True
                receiver_part = match_alt.group(1).lower()
                canonical_receiver = self.ALIAS_MAP.get(receiver_part, receiver_part)
                try:
                    target_user = User.objects.get(username=canonical_receiver)
                    target_username = target_user.username
                except User.DoesNotExist:
                    target_user, _ = self._get_or_create_user(receiver_part)
                    target_username = target_user.username

        if is_settlement:
            if not target_username:
                members = GroupMembership.objects.filter(group=self.group).exclude(user=paid_by_user)
                if members.exists():
                    target_username = members.first().user.username
                else:
                    target_username = self.uploaded_by.username
            return target_username

        return None

    def _detect_duplicate(self, date, paid_by, amount, description):
        """
        Flag potential duplicate: same date, same payer, amount within 1%, description similarity > 0.6
        """
        from decimal import Decimal
        candidates = Expense.objects.filter(
            group=self.group,
            date=date,
            paid_by=paid_by,
            is_deleted=False
        )
        for cand in candidates:
            diff = abs(cand.original_amount - Decimal(str(amount)))
            if diff / cand.original_amount <= Decimal('0.01'):
                sim = difflib.SequenceMatcher(None, description.lower().strip(), cand.description.lower().strip()).ratio()
                if sim > 0.6:
                    return cand
        return None

    def _detect_refund_match(self, date, paid_by, amount_pos, description):
        """
        Look for a matching original expense for a reversal
        """
        words = [w for w in re.split(r'\W+', description.lower()) if len(w) > 3]
        
        candidates = Expense.objects.filter(
            group=self.group,
            paid_by=paid_by,
            date__lt=date,
            is_reversal=False,
            is_deleted=False
        )

        best_match = None
        best_diff_days = float('inf')

        for cand in candidates:
            match = False
            for w in words:
                if w in cand.description.lower():
                    match = True
                    break
            
            amount_diff = abs(cand.converted_amount - Decimal(str(amount_pos)))
            if amount_diff / cand.converted_amount <= Decimal('0.05'):
                match = True

            if match:
                diff_days = (date - cand.date).days
                if diff_days < best_diff_days:
                    best_diff_days = diff_days
                    best_match = cand

        return best_match

    def import_csv_data(self, csv_file_wrapper):
        batch = ImportBatch.objects.create(
            group=self.group,
            uploaded_by=self.uploaded_by,
            filename=self.filename,
            status=ImportBatch.StatusChoices.PROCESSING
        )
        
        content = csv_file_wrapper.read()
        if isinstance(content, bytes):
            try:
                csv_text = content.decode('utf-8')
            except UnicodeDecodeError:
                csv_text = content.decode('latin1')
        else:
            csv_text = content

        reader = csv.DictReader(io.StringIO(csv_text))
        
        anomalies_logged = []
        rows_processed = 0
        rows_skipped = 0

        for row_num, row in enumerate(reader, start=1):
            rows_processed += 1
            try:
                with transaction.atomic():
                    self._process_row(row, row_num, batch, anomalies_logged)
            except Exception as e:
                logger.error(f"Row {row_num} failed with error: {str(e)}")
                ImportAnomaly.objects.create(
                    import_batch=batch,
                    csv_row_number=row_num,
                    raw_row_data=row,
                    anomaly_type=ImportAnomaly.AnomalyType.UNPARSEABLE_ROW,
                    description=f"Row processing crashed: {str(e)}",
                    action_taken="row skipped entirely, manual entry required",
                    status=ImportAnomaly.StatusChoices.NEEDS_REVIEW
                )
                anomalies_logged.append(ImportAnomaly.AnomalyType.UNPARSEABLE_ROW)
                rows_skipped += 1

        has_needs_review = ImportAnomaly.objects.filter(
            import_batch=batch,
            status=ImportAnomaly.StatusChoices.NEEDS_REVIEW
        ).exists()

        if has_needs_review:
            batch.status = ImportBatch.StatusChoices.COMPLETED_WITH_FLAGS
        else:
            batch.status = ImportBatch.StatusChoices.COMPLETED
        batch.save()

        expenses_created = Expense.objects.filter(import_batch=batch, is_deleted=False).count()
        payments_created = Payment.objects.filter(import_batch=batch).count()
        anomalies_count = ImportAnomaly.objects.filter(import_batch=batch).count()
        needs_review_count = ImportAnomaly.objects.filter(import_batch=batch, status=ImportAnomaly.StatusChoices.NEEDS_REVIEW).count()
        auto_resolved_count = anomalies_count - needs_review_count

        return {
            'import_batch_id': batch.id,
            'status': batch.status,
            'summary': {
                'total_rows_processed': rows_processed,
                'auto_resolved_count': auto_resolved_count,
                'needs_review_count': needs_review_count,
                'expenses_created': expenses_created,
                'payments_created': payments_created,
                'rows_skipped': rows_skipped
            }
        }

    def _process_row(self, row, row_num, batch, anomalies_logged):
        row_anomalies = []
        
        # Define round_amount helper inside local scope
        def round_amount(val):
            return Decimal(str(val)).quantize(Decimal('0.01'))
        
        # 1. Date normalization
        date_str = row.get('date', '').strip()
        if not date_str:
            raise ValueError("Date field is missing.")
        parsed_date, date_anom = self._normalize_date(date_str)
        for a in date_anom:
            if a == 'DATE_FORMAT_AMBIGUOUS':
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.DATE_FORMAT_AMBIGUOUS,
                    'desc': f"Slash date format '{date_str}' was used. Assumed day-first (DD/MM/YYYY).",
                    'action': f"Parsed as date {parsed_date}.",
                    'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                })
            elif a == 'DATE_MISSING_YEAR':
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.DATE_MISSING_YEAR,
                    'desc': f"Bare date '{date_str}' had no year.",
                    'action': f"Inferred year {parsed_date.year} from surrounding chronology.",
                    'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                })

        # 2. Payer resolution
        paid_by_str = row.get('paid_by', '').strip()
        if not paid_by_str:
            raise ValueError("Paid_by field is missing.")
        paid_by_user, alias_applied = self._get_or_create_user(paid_by_str)
        if alias_applied:
            row_anomalies.append({
                'type': ImportAnomaly.AnomalyType.NAME_ALIAS_RESOLVED,
                'desc': f"Payer name '{paid_by_str}' resolved to canonical user '{paid_by_user.username}'.",
                'action': "Mapped name to canonical user profile.",
                'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
            })

        # 3. Clean amount
        amount_str = row.get('amount', '').strip()
        if not amount_str:
            raise ValueError("Amount field is missing.")
        amount_val, amt_anom = self._clean_amount(amount_str)
        for a in amt_anom:
            if a == 'AMOUNT_FORMAT_CLEANED':
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.AMOUNT_FORMAT_CLEANED,
                    'desc': f"Amount field '{amount_str}' contained thousands separators.",
                    'action': f"Stripped separators, parsed as {amount_val}.",
                    'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                })

        # 4. Zero Amount rows check
        if amount_val == 0:
            ImportAnomaly.objects.create(
                import_batch=batch,
                csv_row_number=row_num,
                raw_row_data=row,
                anomaly_type=ImportAnomaly.AnomalyType.ZERO_AMOUNT,
                description="Transaction amount is zero.",
                action_taken="skipped, no financial record created",
                status=ImportAnomaly.StatusChoices.AUTO_RESOLVED
            )
            anomalies_logged.append(ImportAnomaly.AnomalyType.ZERO_AMOUNT)
            return

        # 5. Clean currency
        currency_str = row.get('currency', '').strip()
        currency, orig_amount, conv_amount, exchange_rate, curr_anom = self._clean_currency(currency_str, amount_val)
        for a in curr_anom:
            if a == 'CURRENCY_MISSING':
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.CURRENCY_MISSING,
                    'desc': "Currency column was blank.",
                    'action': "Defaulted to base currency INR.",
                    'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                })
            elif a == 'CURRENCY_CONVERSION_APPLIED':
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.CURRENCY_CONVERSION_APPLIED,
                    'desc': f"Currency is USD. Converted ${orig_amount} to INR using rate {exchange_rate}.",
                    'action': f"Set converted_amount to {conv_amount} INR.",
                    'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                })

        # 6. Settlement misclassified as expense check
        settlement_recipient = self._detect_settlement(row, paid_by_user)
        if settlement_recipient:
            recipient_user, r_alias = self._get_or_create_user(settlement_recipient)
            
            payment = Payment.objects.create(
                group=self.group,
                paid_by=paid_by_user,
                paid_to=recipient_user,
                amount=conv_amount,
                date=parsed_date,
                note=row.get('notes', '').strip() or row.get('description', '').strip(),
                source=Payment.SourceChoices.CSV_IMPORT,
                import_batch=batch,
                raw_csv_row=row
            )

            ImportAnomaly.objects.create(
                import_batch=batch,
                csv_row_number=row_num,
                raw_row_data=row,
                anomaly_type=ImportAnomaly.AnomalyType.SETTLEMENT_MISCLASSIFIED_AS_EXPENSE,
                description=f"Settlement transaction misclassified as expense. Description: '{row.get('description')}', Notes: '{row.get('notes')}'",
                action_taken=f"Created Payment record (ID: {payment.id}) from '{paid_by_user.username}' to '{recipient_user.username}' for {conv_amount} INR instead of Expense.",
                status=ImportAnomaly.StatusChoices.AUTO_RESOLVED
            )
            
            for anom in row_anomalies:
                ImportAnomaly.objects.create(
                    import_batch=batch,
                    csv_row_number=row_num,
                    raw_row_data=row,
                    anomaly_type=anom['type'],
                    description=anom['desc'],
                    action_taken=anom['action'],
                    status=anom['status']
                )
                anomalies_logged.append(anom['type'])
                
            anomalies_logged.append(ImportAnomaly.AnomalyType.SETTLEMENT_MISCLASSIFIED_AS_EXPENSE)
            return

        # 7. Check if negative amount (refund)
        is_reversal = False
        reversed_expense = None
        if amount_val < 0:
            is_reversal = True
            positive_conv_amount = -conv_amount
            positive_orig_amount = -orig_amount
            
            matched_expense = self._detect_refund_match(parsed_date, paid_by_user, positive_conv_amount, row.get('description', ''))
            
            if matched_expense:
                reversed_expense = matched_expense
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.NEGATIVE_AMOUNT_REFUND,
                    'desc': f"Negative refund transaction of {amount_val} detected.",
                    'action': f"Linked reversal to original expense ID {matched_expense.id} ({matched_expense.description}).",
                    'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                })
            else:
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.NEGATIVE_AMOUNT_REFUND,
                    'desc': f"Negative refund transaction of {amount_val} detected. Original expense not found.",
                    'action': "Created as unlinked reversal expense. Flagged for manual review to link or merge.",
                    'status': ImportAnomaly.StatusChoices.NEEDS_REVIEW
                })

        # 8. Duplicate detection
        is_duplicate = False
        duplicate_of = self._detect_duplicate(parsed_date, paid_by_user, abs(amount_val), row.get('description', ''))
        if duplicate_of:
            is_duplicate = True
            row_anomalies.append({
                'type': ImportAnomaly.AnomalyType.DUPLICATE_EXPENSE,
                'desc': f"Possible duplicate of expense ID {duplicate_of.id} ({duplicate_of.description}, INR {duplicate_of.converted_amount}) on {date_str}.",
                'action': "Both rows imported as separate expenses. Flagged for manual review and possible merge/deletion.",
                'status': ImportAnomaly.StatusChoices.NEEDS_REVIEW
            })

        # 9. Membership-date / Non-member in Split filtering
        split_with_str = row.get('split_with', '').strip()
        split_details_str = row.get('split_details', '').strip()
        split_type = row.get('split_type', 'equal').strip().lower()
        if not split_type:
            split_type = 'equal'

        split_with_users = []
        if split_with_str:
            names = [n.strip() for n in re.split(r'[,;]', split_with_str) if n.strip()]
            for name in names:
                u, u_alias = self._get_or_create_user(name)
                if u_alias:
                    row_anomalies.append({
                        'type': ImportAnomaly.AnomalyType.NAME_ALIAS_RESOLVED,
                        'desc': f"Split name '{name}' resolved to canonical user '{u.username}'.",
                        'action': "Mapped split name to canonical user profile.",
                        'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                    })
                split_with_users.append(u)
        else:
            memberships = GroupMembership.objects.filter(group=self.group)
            split_with_users = [m.user for m in memberships]

        notes = row.get('notes', '').strip()
        non_charged_users = []
        for word in re.split(r'\W+', notes.lower()):
            if word in self.ALIAS_MAP:
                canonical_name = self.ALIAS_MAP[word]
                patterns = [
                    f"{word}\\s+not\\s+charged",
                    f"excluding\\s+{word}",
                    f"{word}\\s+excluded",
                    f"not\\s+charging\\s+{word}"
                ]
                has_contradiction = False
                for pat in patterns:
                    if re.search(pat, notes.lower()):
                        has_contradiction = True
                        break
                if has_contradiction:
                    try:
                        ex_user = User.objects.get(username=canonical_name)
                        non_charged_users.append(ex_user)
                    except User.DoesNotExist:
                        pass

        if non_charged_users:
            split_with_users = [u for u in split_with_users if u not in non_charged_users]
            for ex_user in non_charged_users:
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.SPLIT_NOTE_CONTRADICTION,
                    'desc': f"Notes field contradict split_with: notes say '{ex_user.username}' is not charged, but they are in split_with.",
                    'action': f"Excluded '{ex_user.username}' from the split.",
                    'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                })

        active_member_ids = set(GroupMembership.objects.filter(
            group=self.group,
            joined_at__lte=parsed_date
        ).filter(
            Q(left_at__isnull=True) | Q(left_at__gte=parsed_date)
        ).values_list('user_id', flat=True))

        non_members_in_split = []
        for u in split_with_users:
            if u.id not in active_member_ids:
                non_members_in_split.append(u)

        target_group = self.group
        
        if non_members_in_split:
            description_lower = row.get('description', '').lower()
            notes_lower = notes.lower()
            trip_keywords = ['trip', 'tour', 'goa', 'kerala', 'travel', 'flight', 'hotel', 'stay', 'vacation']
            is_trip = False
            if currency == 'USD':
                is_trip = True
            else:
                for kw in trip_keywords:
                    if kw in description_lower or kw in notes_lower:
                        is_trip = True
                        break

            if is_trip:
                trip_group_name = f"{self.group.name} - Trip"
                place_match = re.search(r'\b(goa|kerala|mumbai|delhi|manali|leh)\b', description_lower)
                if place_match:
                    trip_group_name = f"{self.group.name} - {place_match.group(1).capitalize()} Trip"
                
                trip_group, tg_created = Group.objects.get_or_create(
                    name=trip_group_name,
                    defaults={'created_by': self.uploaded_by}
                )
                
                all_trip_user_ids = list(active_member_ids) + [u.id for u in non_members_in_split]
                for uid in all_trip_user_ids:
                    GroupMembership.objects.get_or_create(
                        group=trip_group,
                        user_id=uid,
                        defaults={'joined_at': parsed_date}
                    )
                    
                target_group = trip_group
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.NON_MEMBER_IN_SPLIT,
                    'desc': f"Non-group members {[u.username for u in non_members_in_split]} in splits for a trip expense.",
                    'action': f"Created a separate Trip group '{trip_group.name}' and imported this expense there.",
                    'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                })
            else:
                split_with_users = [u for u in split_with_users if u not in non_members_in_split]
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.NON_MEMBER_IN_SPLIT,
                    'desc': f"Non-group members {[u.username for u in non_members_in_split]} in split for a non-trip expense.",
                    'action': "Excluded non-members from the split.",
                    'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                })

        if not split_with_users:
            raise ValueError("No active group members remaining in splits list.")

        # 10. Split detail free-text parsing (AI parsing vs fallback)
        ai_parsed_splits = None
        if split_details_str and split_type in ['unequal', 'percentage']:
            all_canonical_names = [u.username for u in split_with_users]
            llm_result = call_llm_for_split_parsing(
                description=row.get('description', ''),
                split_type=split_type,
                split_details=split_details_str,
                member_names=all_canonical_names,
                total_amount=abs(amount_val)
            )

            valid_ai_split = False
            if llm_result and 'splits' in llm_result:
                confidence = llm_result.get('confidence', 'low')
                names_resolve = True
                total_sum = Decimal('0.00')
                parsed_splits = []
                for s in llm_result['splits']:
                    member_name = s.get('member', '').strip().lower()
                    canonical_name = self.ALIAS_MAP.get(member_name, member_name)
                    try:
                        target_user = User.objects.get(username=canonical_name)
                        if target_user in split_with_users:
                            s['user'] = target_user
                            parsed_splits.append(s)
                            if split_type == 'unequal':
                                total_sum += Decimal(str(s.get('amount', 0)))
                            else:
                                total_sum += Decimal(str(s.get('percentage', 0)))
                        else:
                            names_resolve = False
                    except User.DoesNotExist:
                        names_resolve = False

                sum_correct = False
                if split_type == 'unequal':
                    if abs(total_sum - Decimal(str(abs(amount_val)))) <= Decimal('1.00'):
                        sum_correct = True
                else:
                    if abs(total_sum - Decimal('100.0')) <= Decimal('0.01'):
                        sum_correct = True

                if confidence == 'high' and names_resolve and sum_correct:
                    valid_ai_split = True
                    ai_parsed_splits = parsed_splits

            if valid_ai_split:
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.SPLIT_DETAILS_PARSED_VIA_AI,
                    'desc': f"Free-text split details '{split_details_str}' parsed successfully using AI.",
                    'action': "Structured splits created based on AI parsing.",
                    'status': ImportAnomaly.StatusChoices.AUTO_RESOLVED
                })
            else:
                split_type = 'equal'
                llm_returned_str = json.dumps(llm_result) if llm_result else "No response"
                row_anomalies.append({
                    'type': ImportAnomaly.AnomalyType.SPLIT_DETAILS_PARSE_FAILED_FALLBACK,
                    'desc': f"Failed to parse free-text split details '{split_details_str}' using AI. LLM response: {llm_returned_str}",
                    'action': "Fell back to an equal split among split_with members. Flagged for manual review.",
                    'status': ImportAnomaly.StatusChoices.NEEDS_REVIEW
                })

        expense = Expense.objects.create(
            group=target_group,
            description=row.get('description', '').strip(),
            date=parsed_date,
            paid_by=paid_by_user,
            currency=currency,
            original_amount=abs(orig_amount),
            converted_amount=-conv_amount if is_reversal else conv_amount,
            exchange_rate_used=exchange_rate,
            split_type=split_type,
            is_reversal=is_reversal,
            reversed_expense=reversed_expense,
            source=Expense.SourceChoices.CSV_IMPORT,
            import_batch=batch,
            raw_csv_row=row,
            is_deleted=False
        )

        num_users = len(split_with_users)
        
        if split_type == 'equal':
            base_share = round_amount(expense.converted_amount / Decimal(str(num_users)))
            total_shares = base_share * num_users
            remainder = expense.converted_amount - total_shares
            
            splits = []
            for index, u in enumerate(split_with_users):
                splits.append({
                    'user': u,
                    'share_amount': base_share,
                    'share_percentage': round_amount(Decimal('100.0') / Decimal(str(num_users)))
                })
            if remainder != Decimal('0.00'):
                payer_split = next((s for s in splits if s['user'].id == expense.paid_by_id), None)
                if payer_split:
                    payer_split['share_amount'] += remainder
                else:
                    splits[0]['share_amount'] += remainder
                    
            for s in splits:
                ExpenseSplit.objects.create(
                    expense=expense,
                    user=s['user'],
                    share_amount=s['share_amount'],
                    share_percentage=s['share_percentage']
                )

        elif split_type == 'unequal' and ai_parsed_splits:
            splits = []
            total_converted_split_sum = Decimal('0.00')
            for s in ai_parsed_splits:
                u = s['user']
                orig_share = Decimal(str(s['amount']))
                if currency == 'USD':
                    share_in_inr = round_amount(orig_share * exchange_rate)
                else:
                    share_in_inr = round_amount(orig_share)
                total_converted_split_sum += share_in_inr
                pct = round_amount((orig_share / expense.original_amount) * Decimal('100.0'))
                splits.append({
                    'user': u,
                    'share_amount': share_in_inr,
                    'share_percentage': pct
                })
            remainder = expense.converted_amount - total_converted_split_sum
            if remainder != Decimal('0.00'):
                payer_split = next((s for s in splits if s['user'].id == expense.paid_by_id), None)
                if payer_split:
                    payer_split['share_amount'] += remainder
                else:
                    splits[0]['share_amount'] += remainder
            for s in splits:
                ExpenseSplit.objects.create(
                    expense=expense,
                    user=s['user'],
                    share_amount=s['share_amount'],
                    share_percentage=s['share_percentage']
                )

        elif split_type == 'percentage' and ai_parsed_splits:
            splits = []
            total_converted_split_sum = Decimal('0.00')
            for s in ai_parsed_splits:
                u = s['user']
                pct = Decimal(str(s['percentage']))
                share_in_inr = round_amount(expense.converted_amount * (pct / Decimal('100.0')))
                total_converted_split_sum += share_in_inr
                splits.append({
                    'user': u,
                    'share_amount': share_in_inr,
                    'share_percentage': pct
                })
            remainder = expense.converted_amount - total_converted_split_sum
            if remainder != Decimal('0.00'):
                payer_split = next((s for s in splits if s['user'].id == expense.paid_by_id), None)
                if payer_split:
                    payer_split['share_amount'] += remainder
                else:
                    splits[0]['share_amount'] += remainder
            for s in splits:
                ExpenseSplit.objects.create(
                    expense=expense,
                    user=s['user'],
                    share_amount=s['share_amount'],
                    share_percentage=s['share_percentage']
                )

        for anom in row_anomalies:
            ImportAnomaly.objects.create(
                import_batch=batch,
                csv_row_number=row_num,
                raw_row_data=row,
                anomaly_type=anom['type'],
                description=anom['desc'],
                action_taken=anom['action'],
                status=anom['status']
            )
            anomalies_logged.append(anom['type'])
