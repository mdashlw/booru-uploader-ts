# booru-uploader-ts

A command-line tool for scraping various sites and uploading images to Derpibooru.

Derpibooru topic: https://derpibooru.org/forums/meta/topics/my-derpibooru-uploader

## Getting Started

### Prerequisites

- [Node.js v22+](https://nodejs.org/en/download/prebuilt-installer)
- [git](https://git-scm.com/downloads)

### Where to type commands:

- **Windows:** PowerShell (or [Windows Terminal](https://aka.ms/terminal), recommended)
- **MacOS/Linux:** Terminal

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
- `DEVIANTART_CSRF_TOKEN` - on the same page, click View Page Source and Ctrl+F for "csrf"
- DeviantArt cookie and csrf token are linked. When you change the cookie, you need to update the csrf token as well.
- `DEVIANTART_USERNAME` and `DEVIANTART_PASSWORD` - optional. `npm run deviantart-login` will try to update cookies/csrf using these credentials but it doesn't always work
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

### Description

When uploading, the tool automatically generates a description from the specified sources.

Do `npm run description` or `npm run description 3506534` to generate it manually and copy to clipboard.

```
Boosty (December 20, 2023 at 10:07:19 PM UTC)
> **🤍🎄**
> Looks like it's that time again where the sketch looks better than the finale 😅 
>
> Have you put up the Christmas tree yet?🎄
>
> [#zipp storm](https://boosty.to/itssim?postsTagsIds=578559) [#izzy moonbow](https://boosty.to/itssim?postsTagsIds=1626400)

Twitter (December 22, 2023 at 3:47:00 PM UTC)
> 🤍🎄
> Have you decorated your Christmas tree yet?
> \#ZippStorm \#mlpgen5 \#mlpg5 \#IzzyMoonbow

DeviantArt (January 8, 2024 at 10:51:01 AM UTC)
> **Zippmas tree**
>
>
> [#izzymoonbow](https://www.deviantart.com/tag/izzymoonbow) [#zippstorm](https://www.deviantart.com/tag/zippstorm)
```
