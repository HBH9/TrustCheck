[README.md](https://github.com/user-attachments/files/35245449/README.md)
# TrustCheck: setup guide

TrustCheck runs as a normal website with two links:

| Link | Who it is for |
|---|---|
| `https://YOUR-NAME.github.io/trustcheck/` | Customers and businesses. No account needed to check, register or report. |
| `https://YOUR-NAME.github.io/trustcheck/reviewer.html` | The reviewer. Opens with the reviewer's email and password. |

It uses two free services: **Supabase** (the database) and **GitHub Pages** (the website).
Setup takes about 30 to 45 minutes. Do part A first, then part B.

Files in this folder:

| File | What it is |
|---|---|
| `index.html` | The public site (customers and businesses) |
| `reviewer.html` | The reviewer page |
| `tc-supabase.js` | Connects the pages to the database |
| `config.js` | Your two Supabase values go here (step A6) |
| `setup.sql` | Creates the database and its security rules (step A3) |

---

## A. Database (Supabase)

1. **Create an account.** Go to **supabase.com** and press **Start your project**. Signing in with GitHub is easiest, because you need a GitHub account for part B anyway.

2. **Create a project.** Press **New project**.
   - Name: `trustcheck`
   - Database password: press **Generate a password** and save it somewhere safe.
   - Region: the one closest to the UAE.
   - Plan: **Free**.
   Press **Create new project** and wait about 2 minutes until it is ready.

3. **Create the tables and rules.** In the left menu open **SQL Editor** and start a new query.
   - Open `setup.sql` from this folder with any text editor (Notepad, TextEdit), copy everything, and paste it in.
   - On the **last line**, replace `reviewer@example.com` with **your own email** (the reviewer's email). Keep the quotes.
   - Press **Run**. You should see *Success. No rows returned*.

4. **Let visitors use the site without an account.** Open **Authentication**, then **Sign In / Providers** (on some screens it is under **Authentication > Settings**).
   - Turn on **Allow anonymous sign-ins** and save.
   - Leave **Confirm email** turned on.

5. **Create the reviewer account.** Open **Authentication > Users**, press **Add user > Create new user**.
   - Email: the same email you wrote in step 3.
   - Password: a strong password you will remember.
   - Tick **Auto Confirm User**, then **Create user**.

6. **Copy your two keys into `config.js`.** Open **Project Settings > API** (on newer screens: **Project Settings > Data API** for the URL and **API Keys** for the key).
   - Copy the **Project URL** (looks like `https://abcdefghijklmnop.supabase.co`).
   - Copy the **anon public** key (or the **Publishable key** on newer projects). Never use the *service_role* or *secret* key.
   - Open `config.js` in a text editor and paste them between the quotes:
     ```js
     url: 'https://abcdefghijklmnop.supabase.co',
     anonKey: 'eyJhbGciOi...the long key...',
     ```
   - Save the file.

---

## B. Website (GitHub Pages)

1. **Create an account** at **github.com** (skip if you have one). Your username becomes part of the link.

2. **Create a repository.** Press **+** (top right) > **New repository**.
   - Name: `trustcheck`
   - Choose **Public**.
   - Press **Create repository**.

3. **Upload the files.** On the new repository page press **uploading an existing file**.
   - Drag in `index.html`, `reviewer.html`, `tc-supabase.js` and `config.js` (the one you edited in A6). You can add `README.md` and `setup.sql` too.
   - Press **Commit changes**.

4. **Turn the website on.** Open **Settings > Pages**.
   - Source: **Deploy from a branch**.
   - Branch: **main**, folder **/ (root)**, then **Save**.
   - Wait 1 to 2 minutes and refresh. GitHub shows *Your site is live at https://YOUR-NAME.github.io/trustcheck/*.

---

## C. Test it

1. Open the **public link** in a private/incognito window. Register a test business with a licence photo and press **Submit for verification**. It should say *Pending verification*.
2. Open the **reviewer link** (`.../reviewer.html`) and sign in with the email and password from A5. The application appears under **Applications**.
3. Tick the licence check box and press **Approve and publish**.
4. Back in the private window, within a few seconds the application changes to **Verified**, and checking the handle gives **Strong match**.

---

## Good to know

- **Changing a file later:** open it on GitHub, press the pencil icon, edit, **Commit changes**. The site updates in a minute or two.
- **Adding another reviewer:** create their user in **Authentication > Users** (A5), then run this in the SQL Editor with their email:
  `insert into public.reviewers (email) values ('their@email.com');`
- **Free plan pause:** Supabase pauses free projects after about a week with no visits. If the site says it can't reach the database, open your project on supabase.com and press **Restore**.
- **What visitors can see:** everyone can read verified businesses and confirmed scam accounts. A visitor can read and change only their own applications and reports. Only reviewers can read all of them, approve, reject or confirm. These rules are enforced by the database (`setup.sql`), not just by the page.
- **Privacy:** photos being checked never leave the visitor's browser. Licence photos are stored in your Supabase project, visible only to the applicant and reviewers, and deleted when a reviewer decides. The anon/publishable key in `config.js` is meant to be public; the rules above protect the data.
- **Each visitor's history stays in their browser.** If someone clears their browser data or uses another device, they can't see the status of applications they sent before (the reviewer still has them).
