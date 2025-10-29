# Timesheet App

## Getting the Latest Changes

To update your local copy of the project with the newest commits from the remote repository:

1. Open a terminal in the project directory.
2. Ensure you are on the branch you want to update (for example, `main`).
   ```bash
   git status
   ```
   If you are not on the desired branch, switch to it:
   ```bash
   git checkout main
   ```
3. Fetch the latest commits from the remote:
   ```bash
   git fetch origin
   ```
4. Pull the updates into your local branch:
   ```bash
   git pull origin main
   ```

If you have local changes you do not want to lose, commit or stash them before pulling. Otherwise, Git may block the pull until the working tree is clean.

## Running the App Locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).
