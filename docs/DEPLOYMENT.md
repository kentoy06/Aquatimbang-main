# Putting AquaTimbang online

The website (React) is already published by GitHub Pages at
`https://kentoy06.github.io/Aquatimbang-main/`. It needs the Django backend
running somewhere on the internet to log in and load data. This guide uses
**PythonAnywhere's free plan**, because it:

- runs Django with HTTPS included,
- includes a free **MySQL** database (the paper uses MySQL),
- keeps uploaded photos and documents (many free hosts delete them on restart).

> These steps follow PythonAnywhere's documented setup. They could not be
> tried from the development environment, so if a screen looks different,
> follow PythonAnywhere's own help page for that step.

Replace `yourname` below with your PythonAnywhere username.

---

## 1. Create the account and the database

1. Sign up at <https://www.pythonanywhere.com> (Beginner / free plan).
   Your backend address will be `https://yourname.pythonanywhere.com`.
2. Open the **Databases** tab:
   - Set a MySQL password (save it).
   - Under *Create a database*, type `aquatimbang` and create it.
     Its full name is `yourname$aquatimbang`.
   - Note the **Database host address**, e.g. `yourname.mysql.pythonanywhere-services.com`.

## 2. Get the code and install the packages

Open **Consoles → Bash** and run:

```bash
git clone https://github.com/kentoy06/Aquatimbang-main.git
cd Aquatimbang-main/backend
mkvirtualenv --python=python3.11 --system-site-packages aquatimbang
pip install -r requirements.txt
```

`--system-site-packages` reuses the numpy, pandas, scipy and statsmodels that
PythonAnywhere already has installed, which saves disk space (the free plan
has 512 MB). Check what is left with `du -sh ~`.

If the install stops with a disk-quota error, install only what the site
needs and skip the auto-order search:

```bash
pip install "Django>=5.2,<5.3" "djangorestframework>=3.18,<4" "django-cors-headers>=4.9,<5" Pillow mysqlclient
```

Forecasts still work without `pmdarima`: when the SARIMAX libraries are
missing, the forecast page shows the trend line with its warning (UC-6 E1).

## 3. Settings file

Still in `Aquatimbang-main/backend`, create the settings file:

```bash
nano .env
```

Paste this, fill in your values, then save with **Ctrl+O, Enter, Ctrl+X**:

```ini
DJANGO_SECRET_KEY=paste-a-long-random-string-here
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=yourname.pythonanywhere.com
CSRF_TRUSTED_ORIGINS=https://yourname.pythonanywhere.com

DB_ENGINE=mysql
DB_NAME=yourname$aquatimbang
DB_USER=yourname
DB_PASSWORD=your-mysql-password
DB_HOST=yourname.mysql.pythonanywhere-services.com
DB_PORT=3306

CORS_ALLOWED_ORIGINS=https://kentoy06.github.io
FRONTEND_URL=https://kentoy06.github.io/Aquatimbang-main/
MEDIA_ROOT=/home/yourname/aquatimbang-media

# Email for password reset links and lockout notices (optional, see step 7).
EMAIL_HOST=
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
```

Make the secret key with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

## 4. Create the tables and the first Administrator

```bash
python manage.py migrate
python manage.py setup_aquatimbang --admin-username admin --admin-email you@example.com
python manage.py collectstatic --noinput
mkdir -p ~/aquatimbang-media
```

`setup_aquatimbang` creates the three roles (Administrator, LGU Officer,
Fish Vendor) and asks for the Administrator's password. Afterwards log in as
that Administrator and add the municipalities, markets and fish species.

## 5. Set up the web app

Open the **Web** tab → **Add a new web app** → *Manual configuration* →
**Python 3.11**. Then on that page:

1. **Virtualenv:** `/home/yourname/.virtualenvs/aquatimbang`
2. **Source code:** `/home/yourname/Aquatimbang-main/backend`
3. **WSGI configuration file:** click the link, delete everything, paste:

   ```python
   import os
   import sys

   path = "/home/yourname/Aquatimbang-main/backend"
   if path not in sys.path:
       sys.path.insert(0, path)

   os.environ["DJANGO_SETTINGS_MODULE"] = "aquatimbang_backend.settings"

   from django.core.wsgi import get_wsgi_application
   application = get_wsgi_application()
   ```

4. **Static files:** URL `/static/` → Directory `/home/yourname/Aquatimbang-main/backend/staticfiles`
5. **Force HTTPS:** turn on.
6. Click the green **Reload** button.

Check it: <https://yourname.pythonanywhere.com/api/health/> should answer.
If not, open the **error log** link on the Web tab.

## 6. Point the website at the backend

On GitHub: **kentoy06/Aquatimbang-main → Settings → Secrets and variables →
Actions → Variables → New repository variable**

- Name: `VITE_API_BASE_URL`
- Value: `https://yourname.pythonanywhere.com/api`

Then **Actions → Deploy to GitHub Pages → Run workflow** (or push any
change). When it finishes, the website logs in using the online backend.

## 7. Email (optional): password reset and lockout notices

Without email settings, emails are only written to the server log. To send
them for real with Gmail:

1. Turn on **2-Step Verification** for the Gmail account.
2. Create an **App password** (Google Account → Security → App passwords).
3. In `.env` set:

   ```ini
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USE_TLS=True
   EMAIL_HOST_USER=yourteam@gmail.com
   EMAIL_HOST_PASSWORD=the-16-letter-app-password
   DEFAULT_FROM_EMAIL=AquaTimbang <yourteam@gmail.com>
   ```

4. Reload the web app.

Free PythonAnywhere accounts can only reach approved sites; Gmail's mail
server is one of them. If emails fail, check PythonAnywhere's help page on
sending email from a free account.

## 8. Updating the online backend later

```bash
cd ~/Aquatimbang-main && git pull
cd backend && workon aquatimbang
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
```

Then click **Reload** on the Web tab.

## Things to know

- **Free plan:** log in to PythonAnywhere at least once every 3 months and
  click "Run until 3 months from today" on the Web tab, or the site stops.
- **Test data:** the online database starts empty. Real prices must be
  entered (or imported) there; your laptop's database is separate.
- **Privacy:** uploaded IDs, permits and photos are only served to logged-in
  reviewers; only fish photos are public.
