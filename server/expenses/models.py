from django.db import models
from django.contrib.auth.models import User

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    display_name = models.CharField(max_length=150)

    def __str__(self):
        return f"{self.user.username} ({self.display_name})"

class Group(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_groups')

    def __str__(self):
        return self.name

class GroupMembership(models.Model):
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memberships')
    joined_at = models.DateField()
    left_at = models.DateField(null=True, blank=True)

    class Meta:
        unique_together = ('group', 'user')

    def __str__(self):
        left_str = f" to {self.left_at}" if self.left_at else " (active)"
        return f"{self.user.username} in {self.group.name} from {self.joined_at}{left_str}"

class ImportBatch(models.Model):
    class StatusChoices(models.TextChoices):
        PROCESSING = 'processing', 'Processing'
        COMPLETED = 'completed', 'Completed'
        COMPLETED_WITH_FLAGS = 'completed_with_flags', 'Completed with Flags'

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='import_batches')
    uploaded_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='uploaded_batches')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    filename = models.CharField(max_length=255)
    status = models.CharField(
        max_length=30,
        choices=StatusChoices.choices,
        default=StatusChoices.PROCESSING
    )

    def __str__(self):
        return f"Batch {self.id} for {self.group.name} ({self.status})"

class Expense(models.Model):
    class CurrencyChoices(models.TextChoices):
        INR = 'INR', 'INR'
        USD = 'USD', 'USD'

    class SplitTypeChoices(models.TextChoices):
        EQUAL = 'equal', 'Equal'
        UNEQUAL = 'unequal', 'Unequal'
        PERCENTAGE = 'percentage', 'Percentage'

    class SourceChoices(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        CSV_IMPORT = 'csv_import', 'CSV Import'

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='expenses')
    description = models.CharField(max_length=255)
    date = models.DateField()
    paid_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='paid_expenses')
    currency = models.CharField(
        max_length=3,
        choices=CurrencyChoices.choices,
        default=CurrencyChoices.INR
    )
    original_amount = models.DecimalField(max_digits=12, decimal_places=2)
    converted_amount = models.DecimalField(max_digits=12, decimal_places=2)  # In INR
    exchange_rate_used = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    split_type = models.CharField(
        max_length=20,
        choices=SplitTypeChoices.choices,
        default=SplitTypeChoices.EQUAL
    )
    is_reversal = models.BooleanField(default=False)
    reversed_expense = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reversals'
    )
    source = models.CharField(
        max_length=20,
        choices=SourceChoices.choices,
        default=SourceChoices.MANUAL
    )
    import_batch = models.ForeignKey(
        ImportBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses'
    )
    raw_csv_row = models.JSONField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.description} ({self.converted_amount} INR)"

class ExpenseSplit(models.Model):
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name='splits')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='splits')
    share_amount = models.DecimalField(max_digits=12, decimal_places=2)  # In INR
    share_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} share: {self.share_amount} ({self.share_percentage or 'N/A'}%)"

class Payment(models.Model):
    class SourceChoices(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        CSV_IMPORT = 'csv_import', 'CSV Import'

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='payments')
    paid_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments_made')
    paid_to = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments_received')
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # In INR
    date = models.DateField()
    note = models.TextField(blank=True, default='')
    source = models.CharField(
        max_length=20,
        choices=SourceChoices.choices,
        default=SourceChoices.MANUAL
    )
    import_batch = models.ForeignKey(
        ImportBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments'
    )
    raw_csv_row = models.JSONField(null=True, blank=True)

    def __str__(self):
        return f"{self.paid_by.username} paid {self.amount} INR to {self.paid_to.username} on {self.date}"

class ImportAnomaly(models.Model):
    class AnomalyType(models.TextChoices):
        DUPLICATE_EXPENSE = 'DUPLICATE_EXPENSE', 'Duplicate Expense'
        SETTLEMENT_MISCLASSIFIED_AS_EXPENSE = 'SETTLEMENT_MISCLASSIFIED_AS_EXPENSE', 'Settlement Misclassified as Expense'
        ZERO_AMOUNT = 'ZERO_AMOUNT', 'Zero Amount'
        CURRENCY_MISSING = 'CURRENCY_MISSING', 'Currency Missing'
        CURRENCY_CONVERSION_APPLIED = 'CURRENCY_CONVERSION_APPLIED', 'Currency Conversion Applied'
        NEGATIVE_AMOUNT_REFUND = 'NEGATIVE_AMOUNT_REFUND', 'Negative Amount Refund'
        DATE_FORMAT_AMBIGUOUS = 'DATE_FORMAT_AMBIGUOUS', 'Date Format Ambiguous'
        DATE_MISSING_YEAR = 'DATE_MISSING_YEAR', 'Date Missing Year'
        NAME_ALIAS_RESOLVED = 'NAME_ALIAS_RESOLVED', 'Name Alias Resolved'
        AMOUNT_FORMAT_CLEANED = 'AMOUNT_FORMAT_CLEANED', 'Amount Format Cleaned'
        SPLIT_DETAILS_PARSED_VIA_AI = 'SPLIT_DETAILS_PARSED_VIA_AI', 'Split Details Parsed via AI'
        SPLIT_DETAILS_PARSE_FAILED_FALLBACK = 'SPLIT_DETAILS_PARSE_FAILED_FALLBACK', 'Split Details Parse Failed Fallback'
        SPLIT_NOTE_CONTRADICTION = 'SPLIT_NOTE_CONTRADICTION', 'Split Note Contradiction'
        NON_MEMBER_IN_SPLIT = 'NON_MEMBER_IN_SPLIT', 'Non-Member in Split'
        UNPARSEABLE_ROW = 'UNPARSEABLE_ROW', 'Unparseable Row'

    class StatusChoices(models.TextChoices):
        AUTO_RESOLVED = 'auto_resolved', 'Auto Resolved'
        NEEDS_REVIEW = 'needs_review', 'Needs Review'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    import_batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name='anomalies')
    csv_row_number = models.IntegerField()
    raw_row_data = models.JSONField()
    anomaly_type = models.CharField(max_length=50, choices=AnomalyType.choices)
    description = models.TextField()
    action_taken = models.TextField()
    status = models.CharField(
        max_length=30,
        choices=StatusChoices.choices,
        default=StatusChoices.NEEDS_REVIEW
    )
    resolved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_anomalies'
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Anomaly ({self.anomaly_type}) at row {self.csv_row_number} - status: {self.status}"
