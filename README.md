<p align="center">
  <img src="./assets/branding/sukuna-md-title.svg" width="720" alt="SUKUNA MD by PASQUA">
</p>

<p align="center">
  <a href="https://github.com/pasquawisdom2007-beep/SUKUNA_MD">
    <img src="./assets/branding/sukuna-md-visual.png" width="520" alt="Sukuna MD red-eye visual by PASQUA">
  </a>
</p>

<p align="center">
  <em>The King of Curses — a panel-paired WhatsApp MD bot.</em>
</p>

<p align="center">
  <a href="https://github.com/pasquawisdom2007-beep/SUKUNA_MD/stargazers"><img src="https://img.shields.io/github/stars/pasquawisdom2007-beep/SUKUNA_MD?style=for-the-badge&color=8b5cf6" alt="GitHub stars"></a>
  <a href="https://github.com/pasquawisdom2007-beep/SUKUNA_MD/network/members"><img src="https://img.shields.io/github/forks/pasquawisdom2007-beep/SUKUNA_MD?style=for-the-badge&color=06b6d4" alt="GitHub forks"></a>
  <a href="https://github.com/pasquawisdom2007-beep/SUKUNA_MD/watchers"><img src="https://img.shields.io/github/watchers/pasquawisdom2007-beep/SUKUNA_MD?style=for-the-badge&color=f97316" alt="GitHub watchers"></a>
  <a href="https://github.com/pasquawisdom2007-beep/SUKUNA_MD"><img src="https://img.shields.io/github/repo-size/pasquawisdom2007-beep/SUKUNA_MD?style=for-the-badge&color=22c55e" alt="Repository size"></a>
</p>

<p align="center"><sub>Text animation first. Sukuna visual immediately after.</sub></p>

---

## About

**SUKUNA MD** is a multi-user WhatsApp bot built around panel-friendly pairing, modular commands, group administration, utilities, media tools, and independent protection engines. The project is maintained by **PASQUA** and uses the Pasqua Baileys fork configured by the repository.

The visual identity in this README uses a text-only animated title above the new red-eye Sukuna artwork. The title is rendered exactly as **SUKUNA MD** and **by PASQUA**, with a black-and-crimson presentation that remains lightweight and repository-friendly.

## Highlights

| Area | Included direction |
|---|---|
| Pairing | Panel-friendly WhatsApp number pairing with saved sessions and reconnect support |
| Commands | Modular command loader with configurable prefixes and command categories |
| Groups | Administration, moderation, member tools, media protection, and group utilities |
| Media | Stickers, downloads, image/video tools, previews, and other media commands |
| Protection | Independent AntiBot handling and separate Guard functionality |
| Deployment | Pterodactyl, VPS, and other Node.js-capable hosting environments |

## How pairing works

1. Deploy the repository on Pterodactyl, a VPS, or another Node.js-capable host.
2. Start the bot with the command shown in the deployment section below.
3. Follow the console prompt:

```text
[PAIR] Enter WhatsApp number with country code:
```

4. Enter the WhatsApp number with its country code, without spaces or symbols. For example:

```text
2349127857212
```

5. The bot generates an eight-character pairing code in the following format:

```text
XXXX-XXXX
```

6. On WhatsApp, open **Linked Devices**, choose **Link with Phone Number**, and enter the displayed code.
7. The session is saved under the configured sessions directory and restored automatically after a restart.

## Pair additional numbers

To pair another account, type `y` when the panel asks whether another number should be paired, or restart the process and provide a new number. Existing sessions remain available and are restored automatically.

## Pterodactyl deployment

This is the deployment flow demonstrated in the walkthrough video. It uses the GitHub ZIP upload method and keeps the extracted project files in the server root.

### 1. Download the repository

Open the main repository:

[https://github.com/pasquawisdom2007-beep/SUKUNA_MD](https://github.com/pasquawisdom2007-beep/SUKUNA_MD)

Choose **Code → Download ZIP** and save the downloaded file as `SUKUNA_MD-main.zip`. The repository may be starred first, but starring is not required for the bot to run.

### 2. Open the Pterodactyl server

Log in to your Pterodactyl panel, open the server where SUKUNA MD will run, and select the **Files** tab.

### 3. Upload and extract the ZIP

Click **Upload**, select `SUKUNA_MD-main.zip`, and wait for the upload to finish. Open the file menu represented by the three dots, choose **Unarchive**, and wait for the `SUKUNA_MD-main` folder to appear.

Open `SUKUNA_MD-main`, select all files and folders inside it, choose **Move**, enter `../` in the **File Name** field, and confirm **Move**. This places `index.js`, `config.js`, `package.json`, `commands/`, `lib/`, `utils/`, and the other project files directly in the server root. Do not leave the application nested inside `SUKUNA_MD-main`.

### 4. Configure the pairing numbers

From the server root, open `config.js`, locate the owner and pairing settings, and replace both values with the same WhatsApp number:

```js
ownerNumber: '2347085635373',
pairNumber:  '2347085635373',
```

Use your own number. Enter it with the country code, without a leading `+`, spaces, brackets, or dashes. The repository’s default pairing code is `PASQUAMD`; leave it unchanged unless you have a specific reason to configure another supported code.

Click **Save Content** after editing the file.

### 5. Start the server

Open the **Console** tab and click **Start**. On the first start, wait while the panel installs the dependencies and launches the application. The relevant commands are:

```bash
npm install
node index.js
```

`npm start` is also supported because the repository defines it as an alias for `node index.js`:

```bash
npm start
```

Keep the console open until the bot displays its startup information and pairing-code prompt. Do not repeatedly click **Start** while installation is still in progress.

### 6. Link WhatsApp

When the console displays the pairing code, open WhatsApp on the phone whose number was entered in `config.js` and follow this path:

**Linked Devices → Link a Device → Link with phone number instead**

Enter the pairing code shown in the Pterodactyl console and wait for the login process to complete.

### 7. Verify the deployment

After the account is linked, SUKUNA MD sends a Getting Started message to the linked account. In the WhatsApp chat, test the deployment with:

```text
.ping
.menu
```

The first command checks that the bot is responding, and the second displays the available command menu. The configured prefix can be changed later; the examples use the repository default `.`.

### Important Pterodactyl checks

| Check | Expected result |
|---|---|
| Project location | `index.js` and `package.json` are in the server root |
| Configuration | `ownerNumber` and `pairNumber` contain the same number without `+` or spaces |
| First start | Dependencies finish installing before the bot is restarted |
| Pairing | The code is entered through WhatsApp’s **Link with phone number instead** flow |
| Persistence | The `sessions/` directory is retained between restarts |

## VPS deployment

```bash
git clone https://github.com/pasquawisdom2007-beep/SUKUNA_MD.git
cd SUKUNA_MD
npm install --omit=dev
node index.js
```

For a headless start:

```bash
PAIR_NUMBER=2349127857212 node index.js
```

A process manager such as `pm2`, `systemd`, or `screen` can be used to keep the bot running after the terminal closes.

## Repository structure

```text
index.js                    Entry point
config.js                   Runtime configuration
lib/
  sessionManager.js         WhatsApp session and connection manager
  gameLobby.js              Game system
commands/                   Modular command collection
utils/                      Shared utilities and protection engines
assets/
  branding/                 README and project branding media
data/                       Runtime data and persisted settings
sessions/                   Saved WhatsApp sessions
```

## Branding assets

The README branding files are kept in [`assets/branding`](./assets/branding):

| File | Purpose |
|---|---|
| [`sukuna-md-title.svg`](./assets/branding/sukuna-md-title.svg) | Text-only animated title shown before the hero image |
| [`sukuna-md-visual.png`](./assets/branding/sukuna-md-visual.png) | New red-eye Sukuna visual used as the README hero image |

## Credits

```yaml
Creator: PASQUA
Bot Name: SUKUNA MD
Repository: pasquawisdom2007-beep/SUKUNA_MD
Library: @pasqua-baileys/baileys
```

## License

```text
MIT License
```

<p align="center">
  <strong>SUKUNA MD</strong><br>
  <sub>by PASQUA · The King of Curses</sub>
</p>

## Deployment targets

SUKUNA MD starts with `npm start`, which runs `node index.js`. The repository includes a root `Procfile` and a lightweight `/health` listener for platforms that require an HTTP process.

### Render

Create a **Web Service** from this repository. Use `npm install` as the build command and `npm start` as the start command. Add `PAIR_NUMBER`, `OWNER_NUMBER`, and either `SESSION_ID` or the normal pairing settings in Render Environment. `PAIR_SITE_URL` defaults to `https://pair-site-wmte.onrender.com`, so it is optional unless you use a different pair site. Render’s environment settings should be used for private values rather than committing them to the repository.

### Heroku

Create an app, connect this repository, and deploy the `main` branch. The root `Procfile` starts the bot with `web: npm start`, while the built-in health listener binds to Heroku’s `$PORT`. Add `PAIR_NUMBER`, `OWNER_NUMBER`, and `SESSION_ID` in the app’s Config Vars when using non-interactive deployment. If no `SESSION_ID` is supplied, the bot can use its normal pairing flow when an interactive console is available.

A Heroku deployment can also be started from the repository’s `app.json`. The repository must be accessible to the Heroku account performing the deployment.

### Spaceify

Open [Spaceify Client](https://client.spaceify.eu), create a Node.js deployment from the repository, set the startup command to `npm start`, and add the same private bot settings as environment variables. Keep the project files in the deployment root so `index.js`, `package.json`, `commands/`, `lib/`, and `utils/` are available at startup.

### Short session IDs

The pair site stores the complete auth bundle in Upstash and sends a short `Pasqua~...` value. `SUKUNA_MD` resolves that value through the pair site, restores all auth files, and then starts the WhatsApp session. The Redis URL and token belong only in the pair-site host’s private environment; they must not be copied into downloaded bot scripts or committed to GitHub.
