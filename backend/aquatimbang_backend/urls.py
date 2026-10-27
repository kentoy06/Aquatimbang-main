# Django administration and URL routing tools.
from django.contrib import admin
from django.urls import path, include


urlpatterns = [
    # Django's built-in administration page.
    path('admin/', admin.site.urls),

    # All AquaTimbang API endpoints begin with /api/.
    path('api/', include('api.urls')),
]