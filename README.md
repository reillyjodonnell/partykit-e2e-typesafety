# PartyKit e2e typesafety

This enables e2e type safety for PartyKit. Def still a WIP. Actively working on syncing schemas between client and server.

---

## Features

- **Schema Validation**: Define schemas for messages using Zod, ensuring type-safe communication.
- **Server & Client APIs**: Easy-to-use interfaces for creating WebSocket servers and clients.
- **Typed Payloads**: Strongly-typed messages for both server-to-client and client-to-server communication.
- **Customizable**: Extend and integrate the system with your existing PartyKit setup.

---

## Table of Contents

- [Important Notes](#important-notes)
- [Server API Usage](#server-api-usage)
- [Client API Usage](#client-api-usage)
- [Key Types and Utilities](#key-types-and-utilities)
- [Example Use Case](#example-use-case)

---

## Important Notes

- The mechanism to **sync schemas between client and server** is still a **work in progress**.
- This library uses `zod` for schema definition and validation.

---

## Server API Usage

Define your server with strong typing and schema validation:

```ts
import { z } from 'zod';
import { createServer, createSchema } from '../lib';

const schema = createSchema({
  join: {
    toClient: z.object({
      id: z.string(),
      name: z.enum(['Reilly', 'Justin', 'Taz', 'Kass', 'Gregg']),
    }),
    toServer: z.object({
      type: z.enum(['fetch', 'request']),
    }),
  },
});

const server = createServer({
  schema,
  onConnect: async (conn) => {
    console.log('Connected');
  },
  onMessage: async ({ type, payload, sender, room }) => {
    switch (type) {
      case 'join': {
        console.log('Join received with payload: ', payload);
        room.broadcast('join', {
          id: 'id',
          name: 'Gregg',
        });
      }
    }
  },
  onClose: async (conn) => {
    console.log('Connection closed:', conn);
  },
});

export default server;
```

---

## Client API Usage

Integrate the client with schema validation and custom handlers:

```tsx
import { usePartySocket } from '../lib';

export default function App() {
  const ws = usePartySocket({
    schema,
    host: 'localhost:1999',
    room: 'my-room',
    party: 'example',
    onOpen: () => {
      ws.send({
        type: 'join',
        payload: { type: 'fetch' },
      });
    },
    onMessage: (message) => {
      switch (message.type) {
        case 'join': {
          console.log(message.payload);
        }
      }
    },
  });

  return (
    <div>
      <h1>PartyKit Demo</h1>
      <p>Check the console for WebSocket events!</p>
    </div>
  );
}
```

---

## Key Types and Utilities

### `createSchema`

Defines a structured schema for WebSocket messages.

```ts
const schema = createSchema({
  join: {
    toServer: z.object({
      type: z.enum(['fetch', 'request']),
    }),
    toClient: z.object({
      id: z.string(),
      name: z.enum(['Reilly', 'Justin', 'Taz', 'Kass', 'Gregg']),
    }),
  },
});
```

### `createServer`

Creates a WebSocket server with the specified schema and handlers.

```ts
const server = createServer({
  schema,
  onConnect: async (connection, room) => { ... },
  onMessage: async ({ type, payload, sender, room }) => { ... },
  onClose: async (connection) => { ... },
});
```

### `usePartySocket`

A custom React hook for managing WebSocket connections on the client side.

```tsx
const ws = usePartySocket({
  schema,
  host: 'localhost:1999',
  room: 'my-room',
  onMessage: (message) => { ... },
});
```

---

## Example Use Case

1. **Server Setup**: Handle messages with type-safe payloads.

2. **Client Integration**: Send and receive structured messages seamlessly.

3. **Real-Time Features**: Use the `broadcast` method to notify clients.

---

## Contributing

Contributions are welcome! Please adhere to the following guidelines:

1. Fork the repository.
2. Make your changes in a new branch.
3. Submit a pull request with a detailed description.

---

## License

This project is licensed under the MIT License.

---

Have fun <3
