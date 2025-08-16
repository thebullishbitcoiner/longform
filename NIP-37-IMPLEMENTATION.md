# NIP-37 Preferred Relays Implementation

This document describes the implementation of [NIP-37](https://github.com/nostr-protocol/nips/blob/master/37.md) Preferred Relays functionality in the Longform application.

## Overview

NIP-37 allows users to specify a subset of relays they trust for private events (kind 4). This implementation provides:

1. **Preferred Relays Management**: UI for configuring trusted relays with read/write policies
2. **NIP-04 Integration**: Support for encrypted private messages using preferred relays
3. **Automatic Relay Selection**: Smart relay selection for private vs public events
4. **Settings Integration**: Full integration with the app's settings system

## Implementation Details

### 1. Event Kind

According to NIP-37, preferred relays are stored as **kind 10013** events.

### 2. Private Tags with NIP-44 Encryption

The relay URLs are stored as **private tags** that are:
- JSON stringified
- NIP-44 encrypted to the signer's keys
- Placed inside the `.content` of the event

This ensures that relay preferences are private and only accessible to the user who created them.

### 3. Relay Policies

Three relay policies are supported:
- **Read Only**: Only receive private events from this relay
- **Write Only**: Only send private events to this relay  
- **Read & Write**: Both send and receive private events with this relay

### 3. File Structure

```
src/
├── utils/
│   ├── preferredRelays.ts      # Core NIP-37 functionality
│   ├── nostr.ts               # NIP-04 + NIP-37 integration
│   └── relayList.ts           # NIP-65 relay list support
├── components/
│   └── (NIP-37 components)
└── app/settings/
    └── page.tsx               # Settings UI
```

### 4. Key Functions

#### `getPreferredRelays(pubkey: string)`
Retrieves preferred relays from localStorage for a user.

#### `getRelaysForPublishingEvent(pubkey: string, eventKind: number)`
Returns relay URLs for publishing events based on NIP-37 policies.

#### `getRelaysForReadingPrivateEvents(pubkey: string)`
Returns relay URLs for reading private events based on NIP-37 policies.

#### `createPreferredRelaysEvent(ndk, relays, userPubkey)`
Creates a NIP-37 preferred relays event with NIP-44 encrypted private tags.

#### `parsePreferredRelaysEvent(event, ndk)`
Parses a NIP-37 preferred relays event with NIP-44 encrypted private tags.

#### `publishEncryptedEvent(ndk, recipientPubkey, content, userPubkey, kind)`
Publishes NIP-04 encrypted events using NIP-37 preferred relays.

#### `subscribeToEncryptedEvents(ndk, userPubkey, callback)`
Subscribes to encrypted events using NIP-37 preferred relays.

## Usage

### 1. Configure Preferred Relays

1. Go to Settings → Preferred Relays
2. Add relay URLs with appropriate policies
3. Save the configuration

### 2. Send Private Messages

```typescript
import { publishEncryptedEvent } from '@/utils/nostr';

await publishEncryptedEvent(
  ndk,
  recipientPubkey,
  messageContent,
  userPubkey,
  4 // kind 4 for private messages
);
```

### 3. Receive Private Messages

```typescript
import { subscribeToEncryptedEvents } from '@/utils/nostr';

const subscription = subscribeToEncryptedEvents(
  ndk,
  userPubkey,
  (event) => {
    // Handle received encrypted event
    const decryptedContent = await ndk.signer.decrypt(sender, event.content);
  }
);
```

## Settings UI

The settings page provides:

1. **Preferred Relays Section**: Configure trusted relays for private events
2. **Relay List Section**: NIP-65 relay list management
3. **Cache Management**: Storage management for relay configurations

## Integration Points

### NostrContext
The main NDK instance is configured to use preferred relays when available.

### Event Publishing
All event publishing automatically uses preferred relays for private events (kind 4).

### Relay Selection
The system intelligently selects relays based on:
- Event kind (private vs public)
- User's preferred relay configuration
- Relay policies (read/write)

## Security Considerations

1. **Private Events Only**: NIP-37 only affects kind 4 (private) events
2. **NIP-44 Encryption**: Relay preferences are encrypted using NIP-44 self-encryption
3. **Private Tags**: Relay URLs are stored as encrypted private tags, not public tags
4. **Trusted Relays**: Users explicitly choose which relays to trust
5. **Policy Enforcement**: Read/write policies are strictly enforced

## Testing

Test NIP-37 functionality by:
1. Configuring preferred relays in Settings
2. Publishing relay preferences to the Nostr network
3. Verifying that private events use preferred relays
4. Checking that relay policies are enforced correctly

## Future Enhancements

1. **Dynamic Relay Updates**: Real-time relay configuration updates
2. **Relay Health Monitoring**: Automatic relay availability checking
3. **Advanced Policies**: More granular relay policies
4. **Relay Discovery**: Automatic discovery of trusted relays
5. **Backup Strategies**: Fallback relay configurations

## Compliance

This implementation follows NIP-37 specification:
- ✅ Uses correct event kind (10013)
- ✅ Stores relay URLs as NIP-44 encrypted private tags
- ✅ Supports read/write policies
- ✅ Only affects private events (kind 4)
- ✅ Integrates with NIP-04 encryption for private messages
- ✅ Provides user control over relay selection

## Troubleshooting

### Common Issues

1. **No Preferred Relays**: Configure relays in Settings first
2. **Encryption Errors**: Ensure NIP-04 support is available
3. **Relay Connection**: Test relay connectivity before use
4. **Policy Mismatch**: Verify read/write policies are correct

### Debug Information

Check browser console for:
- Preferred relay configuration
- Relay selection decisions
- Encryption/decryption status
- Connection attempts

## References

- [NIP-37 Specification](https://github.com/nostr-protocol/nips/blob/master/37.md)
- [NIP-04 Encryption](https://github.com/nostr-protocol/nips/blob/master/04.md)
- [NIP-44 Encryption](https://github.com/nostr-protocol/nips/blob/master/44.md)
- [NIP-65 Relay Lists](https://github.com/nostr-protocol/nips/blob/master/65.md)
