This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Features

### Longform Blogging Platform
A decentralized blogging platform built on Nostr protocol that allows users to:
- Create and edit long-form content
- Publish articles to Nostr network
- Read content from other authors
- Manage drafts and published posts

### Settings & Preferred Relays
The platform includes a settings page that allows users to manage their preferred relays for private events according to [NIP-37](https://github.com/nostr-protocol/nips/blob/master/37.md):

- **Account Information**: View your public key, NIP-05 identifier, and display name
- **Preferred Relays**: Configure trusted relays for private events with different policies:
  - **Read Only**: Only receive private events from this relay
  - **Write Only**: Only send private events to this relay  
  - **Read & Write**: Both send and receive private events with this relay
- **Relay Testing**: Test connection to relays before adding them
- **Relay Management**: Add, remove, and update relay policies

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
