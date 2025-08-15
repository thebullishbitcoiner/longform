This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Features

### Longform Blogging Platform
A decentralized blogging platform built on Nostr protocol that allows users to:
- Create and edit long-form content
- Publish articles to Nostr network
- Read content from other authors
- Manage drafts and published posts
- Highlight text in blog posts (NIP-84 compliant)

### Settings & Relay Management
The platform includes a comprehensive settings page for managing relay preferences:

#### NIP-37 Preferred Relays
Configure trusted relays for private events according to [NIP-37](https://github.com/nostr-protocol/nips/blob/master/37.md):
- **Read Only**: Only receive private events from this relay
- **Write Only**: Only send private events to this relay  
- **Read & Write**: Both send and receive private events with this relay

#### NIP-65 Relay Lists
Publish relay preferences as Nostr events according to [NIP-65](https://github.com/nostr-protocol/nips/blob/master/65.md):
- **Network Publishing**: Share your relay list with the Nostr network
- **Cross-Device Sync**: Your relay preferences sync across different devices
- **Discovery**: Other clients can discover your preferred relays
- **Backup**: Your relay preferences are stored on the Nostr network

#### Relay Management Features
- **Relay Testing**: Test connection to relays before adding them
- **Cross-Sync**: Sync relay lists from preferred relays
- **Local Storage**: Persistent storage of relay preferences
- **Policy Management**: Set read/write permissions for each relay

### Text Highlighting (NIP-84)
The platform supports text highlighting in blog posts according to [NIP-84](https://github.com/nostr-protocol/nips/blob/master/84.md):

#### How to Use
1. **Select Text**: Click and drag to select any text in a blog post
2. **Context Menu**: A context menu will appear with a "Highlight" option
3. **Create Highlight**: Click "Highlight" to create a kind 9802 event
4. **Authentication**: Must be logged in to create highlights

#### Technical Details
- **Event Kind**: 9802 (as specified in NIP-84)
- **Content**: The selected text
- **Tags**: 
  - `e`: Reference to the highlighted post
  - `p`: Reference to the post author
  - `a`: Reference to the post as a longform article
  - `start`/`end`: Position information (when available)
- **Cross-Platform**: Highlights are stored on the Nostr network and can be accessed by other clients

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
