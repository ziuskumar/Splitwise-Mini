from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import RegisterView, GroupViewSet, ExpenseViewSet, ImportBatchViewSet, ImportAnomalyViewSet

router = DefaultRouter()
router.register(r'groups', GroupViewSet, basename='group')
router.register(r'expenses', ExpenseViewSet, basename='expense')
router.register(r'import-batches', ImportBatchViewSet, basename='import-batch')
router.register(r'anomalies', ImportAnomalyViewSet, basename='anomaly')

urlpatterns = [
    # Auth endpoints
    path('auth/register/', RegisterView.as_view(), name='auth_register'),
    path('auth/login/', TokenObtainPairView.as_view(), name='auth_login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth_refresh'),
    
    # Base router endpoints
    path('', include(router.urls)),
]
