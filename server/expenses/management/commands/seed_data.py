from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from decimal import Decimal
from expenses.models import Profile, Group, GroupMembership, Expense, ExpenseSplit, Payment

class Command(BaseCommand):
    help = 'Seeds the database with test users, groups, expenses, and settlements.'

    def handle(self, *args, **options):
        self.stdout.write("Deleting existing data...")
        # Clean up database tables
        Payment.objects.all().delete()
        ExpenseSplit.objects.all().delete()
        Expense.objects.all().delete()
        GroupMembership.objects.all().delete()
        Group.objects.all().delete()
        
        # Don't delete superusers, only test users we create
        test_usernames = ['priya', 'rohan', 'aisha', 'vikram']
        User.objects.filter(username__in=test_usernames).delete()

        self.stdout.write("Creating test users...")
        users = {}
        for name in test_usernames:
            user = User.objects.create_user(
                username=name,
                password=f"password123",
                email=f"{name}@example.com"
            )
            # Fetch or create Profile (might be created by post_save signal depending on logic,
            # but let's update display name to make sure)
            profile, created = Profile.objects.get_or_create(user=user)
            profile.display_name = name.capitalize()
            profile.save()
            users[name] = user
            self.stdout.write(f"  Created user: {name} with display name: {profile.display_name}")

        self.stdout.write("Creating test groups...")
        # Group 1: Flat 202A
        group_flat = Group.objects.create(
            name="Flat 202A",
            created_by=users['rohan']
        )
        
        # Add members to Flat 202A (Priya, Rohan, Aisha)
        m1 = GroupMembership.objects.create(group=group_flat, user=users['rohan'], joined_at=timezone.now().date())
        m2 = GroupMembership.objects.create(group=group_flat, user=users['priya'], joined_at=timezone.now().date())
        m3 = GroupMembership.objects.create(group=group_flat, user=users['aisha'], joined_at=timezone.now().date())

        # Group 2: Road Trip Goa
        group_trip = Group.objects.create(
            name="Road Trip Goa",
            created_by=users['priya']
        )
        
        # Add members to Road Trip Goa (All 4 users)
        for u in users.values():
            GroupMembership.objects.create(group=group_trip, user=u, joined_at=timezone.now().date())

        self.stdout.write("Creating expenses inside Flat 202A...")
        # 1. Rent (Equal Split)
        rent = Expense.objects.create(
            group=group_flat,
            description="Monthly Rent",
            date=timezone.now().date(),
            paid_by=users['rohan'],
            currency="INR",
            original_amount=Decimal("18000.00"),
            converted_amount=Decimal("18000.00"),
            split_type="EQUAL"
        )
        # Create equal splits for Priya, Rohan, Aisha (6000 each)
        for name in ['rohan', 'priya', 'aisha']:
            ExpenseSplit.objects.create(
                expense=rent,
                user=users[name],
                share_amount=Decimal("6000.00"),
                share_percentage=Decimal("33.33")
            )

        # 2. Groceries (Equal Split)
        groceries = Expense.objects.create(
            group=group_flat,
            description="Weekly Groceries",
            date=timezone.now().date(),
            paid_by=users['priya'],
            currency="INR",
            original_amount=Decimal("2400.00"),
            converted_amount=Decimal("2400.00"),
            split_type="EQUAL"
        )
        for name in ['rohan', 'priya', 'aisha']:
            ExpenseSplit.objects.create(
                expense=groceries,
                user=users[name],
                share_amount=Decimal("800.00"),
                share_percentage=Decimal("33.33")
            )

        self.stdout.write("Creating expenses inside Road Trip Goa...")
        # 3. Fuel (Equal Split between all 4)
        fuel = Expense.objects.create(
            group=group_trip,
            description="Car Fuel",
            date=timezone.now().date(),
            paid_by=users['vikram'],
            currency="INR",
            original_amount=Decimal("4000.00"),
            converted_amount=Decimal("4000.00"),
            split_type="EQUAL"
        )
        for name in ['rohan', 'priya', 'aisha', 'vikram']:
            ExpenseSplit.objects.create(
                expense=fuel,
                user=users[name],
                share_amount=Decimal("1000.00"),
                share_percentage=Decimal("25.00")
            )

        # 4. Airbnb Rental (Unequal Split in USD)
        airbnb = Expense.objects.create(
            group=group_trip,
            description="Airbnb Rental",
            date=timezone.now().date(),
            paid_by=users['priya'],
            currency="USD",
            original_amount=Decimal("150.00"),
            converted_amount=Decimal("12450.00"), # 150 * 83.0
            exchange_rate_used=Decimal("83.00"),
            split_type="UNEQUAL"
        )
        # Custom splits: Priya: 5000, Rohan: 3450, Aisha: 2000, Vikram: 2000
        shares = {
            'priya': (Decimal("5000.00"), Decimal("40.16")),
            'rohan': (Decimal("3450.00"), Decimal("27.71")),
            'aisha': (Decimal("2000.00"), Decimal("16.06")),
            'vikram': (Decimal("2000.00"), Decimal("16.06"))
        }
        for name, (amt, pct) in shares.items():
            ExpenseSplit.objects.create(
                expense=airbnb,
                user=users[name],
                share_amount=amt,
                share_percentage=pct
            )

        self.stdout.write("Creating settlements...")
        # 1. Rohan paid Priya 3,500 in Flat 202A
        Payment.objects.create(
            group=group_flat,
            paid_by=users['rohan'],
            paid_to=users['priya'],
            amount=Decimal("3500.00"),
            date=timezone.now().date(),
            note="Flat groceries and rent adjustment"
        )

        # 2. Vikram paid Priya 1,000 in Road Trip Goa
        Payment.objects.create(
            group=group_trip,
            paid_by=users['vikram'],
            paid_to=users['priya'],
            amount=Decimal("1000.00"),
            date=timezone.now().date(),
            note="Goa Trip cash adjustment"
        )

        self.stdout.write(self.style.SUCCESS("Database seeded successfully!"))
        self.stdout.write("Logins for all test users:")
        self.stdout.write("  Username: [priya, rohan, aisha, vikram]")
        self.stdout.write("  Password: password123")
