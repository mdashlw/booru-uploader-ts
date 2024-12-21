# booru-uploader-ts

A command-line tool for scraping various sites and uploading images to Derpibooru.

## Getting Started

### Prerequisites

- Node.js v22+
- git

### Installation

```
git clone https://github.com/mdashlw/booru-uploader-ts.git
cd booru-uploader-ts
npm install
```

### Receiving updates

```
cd booru-uploader-ts
git pull
npm install
```

## Usage

### .env

Rename `.env.example` to `.env` and fill in the required values.

- `DERPIBOORU_API_KEY` - find here: https://derpibooru.org/registrations/edit
- variables below are only required if you want to use the respective scrapers
- `DEVIANTART_CLIENT_ID` and `DEVIANTART_CLIENT_SECRET` - register an app here: https://www.deviantart.com/developers/apps
- additional setup for DeviantArt: edit your app to add `http://localhost:1341/callback` to "OAuth2 Redirect URI Whitelist", then do `npm run deviantart-oauth`
- `DEVIANTART_COOKIE` - login to https://www.deviantart.com/ in incognito and copy the cookie
- `DEVIANTART_CSRF_TOKEN` - on the same page, click View Page Source and Ctrl+F for csrf
- `TUMBLR_COOKIE` - login to https://www.tumblr.com/ in incognito and copy the cookie. important: create an empty blog on the account. the last one in the list will be used for exporting images
- `FURAFFINITY_COOKIE` - login to https://www.furaffinity.net/ and copy the cookie. make sure to set time zone to Greenwich Mean Time with Daylight correction OFF here: https://www.furaffinity.net/controls/settings/
- `DISCORD_CDN_BOT_TOKEN` - used for refreshing Discord CDN links. make a bot here and copy the BOT TOKEN: https://discord.com/developers/applications
- `INKBUNNY_USERNAME` and `INKBUNNY_PASSWORD` - Inkbunny username and password. optional but some submissions are member-only
- `WEASYL_API_KEY` - get here: https://www.weasyl.com/control/apikeys
- `NEWGROUNDS_COOKIE` - login to https://www.newgrounds.com/ and copy the cookie
- todo

### How to copy cookies

1. Login to the site in incognito mode (to avoid messing up the cookies by using the site normally, this is especially important for DeviantArt and Tumblr)
2. Open DevTools with F12 or Ctrl+Shift+I
3. Go to the Network tab
4. Reload the page
5. Click on the first request, scroll to REQUEST HEADERS, find `Cookie` (NOT `Set-Cookie`) header and copy the value
6. If you don't find it, try clicking on other requests until you find it

### Uploading

- `npm start`
- `npm start 3506534` to copy sources from the specified Derpibooru image
