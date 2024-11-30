/* 
Important notes: the mechanism to sync schemas between client and servers is still a WIP

Server API Usage:
in file for party:

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
        const type = payload.type;
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



*








import { z } from 'zod';
import * as Party from 'partykit/server';

/**
 * Makes at least one property required from the given type.
 *
 * @template T - The base type.
 * @template Keys - The keys to make required (defaults to all keys).
 *
 * @example
 * interface Example {
 *   a: string;
 *   b: number;
 *   c?: boolean;
 * }
 *
 * // Makes "a" or "b" required
 * type Test = RequireAtLeastOne<Example, "a" | "b">;
 **/
type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Keys extends keyof T
  ? Omit<T, Keys> & { [K in Keys]-?: T[K] }
  : never;

// This is the basic structure of a message
type MessageSchemaDefinition = Record<
  string,
  RequireAtLeastOne<{ toServer?: any; toClient?: any }>
>;

/**
 * Defines a structured schema for messages that are sent between a client and a server.
 *
 * This function allows you to define the schema for each type of message, specifying
 * the structure for messages sent to the server (`toServer`) and those sent to the client (`toClient`).
 * At least one of `toServer` or `toClient` must be defined for each message type.
 *
 * The schemas are validated using Zod to ensure data consistency and type safety.
 *
 * @template T - The definition of the message schema.
 * @param {Record<string, RequireAtLeastOne<{ toServer?: any; toClient?: any }>>} schemas
 * A record where each key represents a message type (e.g., "join", "leave"), and the value
 * is an object containing optional `toServer` and/or `toClient` Zod schemas.
 *
 * - `toServer` defines the schema for messages the client sends to the server.
 * - `toClient` defines the schema for messages the server sends to the client.
 *
 * @returns {T} - The input schemas, returned as-is, to enable static type inference.
 *
 * @example
 * import { z } from 'zod';
 *
 * const messageSchemas = defineMessages({
 *   join: {
 *     toServer: z.object({
 *       id: z.enum(['1', '2', '3']),
 *       name: z.union([z.string(), z.number()]),
 *     }),
 *     toClient: z.object({
 *       id: z.enum(['1', '2', '3']),
 *       name: z.union([z.string(), z.number()]),
 *     }),
 *   },
 *   leave: {
 *     toServer: z.object({
 *       userId: z.string(),
 *     }),
 *     toClient: z.object({
 *       id: z.enum(['1', '2', '3']),
 *       name: z.union([z.string(), z.number()]),
 *     }),
 *   },
 * });
 *
 *
 * */
export function createSchema<T extends MessageSchemaDefinition>(schemas: T): T {
  return schemas;
}

// Utility type to recursively infer payload types, supporting Zod schemas
type InferNestedPayload<T> =
  // Is it a zod thing
  T extends z.ZodType<any, any, any>
    ? // If so, infer the type
      z.infer<T>
    : // If not is it: type MessageSchemaDefinition = Record<string, any>;
    T extends Record<string, any>
    ? // If so, recursively infer the types
      { [K in keyof T]: InferNestedPayload<T[K]> }
    : // Otherwise return the type
      T;

// InferToServerPayload: Extracts only the toServer types from the schema
type Simplify<T> = { [K in keyof T]: T[K] }; // Flattens nested types for better readability

type InferToServerPayload<T extends MessageSchemaDefinition> = Simplify<{
  [K in keyof T]: T[K]['toServer'] extends z.ZodType<any, any, any>
    ? z.infer<T[K]['toServer']> // Infer the type directly
    : never;
}>;

// InferToClientPayload: Extracts only the toClient types from the schema
type InferToClientPayload<T extends MessageSchemaDefinition> = {
  [K in keyof T]: T[K]['toClient'] extends z.ZodType<any, any, any>
    ? InferNestedPayload<T[K]['toClient']>
    : never;
};

type DiscriminatedUnion<
  T extends MessageSchemaDefinition,
  Target extends 'client' | 'server'
> = {
  [K in keyof T]: {
    type: K; // Discriminant key
    payload: Target extends 'client'
      ? InferToClientPayload<T>[K]
      : Target extends 'server'
      ? InferToServerPayload<T>[K]
      : never; // Payload type for this key
  };
}[keyof T]; // Combine into a union

interface ExtendedRoom<TSchema extends MessageSchemaDefinition>
  extends Party.Room {
  broadcast: <K extends keyof TSchema>(
    type: K,
    payload: InferToClientPayload<TSchema>[K],
    without?: string[]
  ) => void;
  broadcastRaw: (
    msg: string | ArrayBuffer | ArrayBufferView,
    without?: string[]
  ) => void;
}

export function createServer<TSchema extends MessageSchemaDefinition>(config: {
  schema: TSchema;
  onConnect?: (
    connection: Party.Connection,
    room: ExtendedRoom<TSchema>
  ) => Promise<void>;
  onClose?: (
    connection: Party.Connection,
    room: ExtendedRoom<TSchema>
  ) => Promise<void>;
  onMessage?: (
    args: DiscriminatedUnion<TSchema, 'server'> & {
      sender: Party.Connection;
      room: ExtendedRoom<TSchema>;
    } // Use the discriminated union
  ) => Promise<void>;
  handleYDocChange?: (doc: Doc) => void;
  yjsOptions?: YPartyKitOptions;
}): new (room: Party.Room) => Party.Server & {
  room: Party.Room & {
    broadcast: <K extends keyof TSchema>(
      type: K,
      payload: InferToClientPayload<TSchema>[K],
      without?: string[]
    ) => void;
    broadcastRaw: (
      msg: string | ArrayBuffer | ArrayBufferView,
      without?: string[]
    ) => void;
  };
} {
  return class Server implements Party.Server {
    readonly room: Party.Room & {
      broadcast: <K extends keyof TSchema>(
        type: K,
        payload: InferToClientPayload<TSchema>[K],
        without?: string[]
      ) => void;
      broadcastRaw: (
        msg: string | ArrayBuffer | ArrayBufferView,
        without?: string[]
      ) => void;
    };

    constructor(room: Party.Room) {
      this.room = {
        ...room, // Retain all original properties of the room
        broadcast: <K extends keyof TSchema>(
          type: K,
          payload: InferToClientPayload<TSchema>[K],
          without?: string[]
        ) => {
          const message = JSON.stringify({ type, payload });
          room.broadcast(message, without); // Use the original broadcast
        },
        broadcastRaw: room.broadcast.bind(room), // Retain the raw broadcast method
      } as Party.Room & {
        broadcast: <K extends keyof TSchema>(
          type: K,
          payload: InferToClientPayload<TSchema>[K],
          without?: string[]
        ) => void;
        broadcastRaw: (
          msg: string | ArrayBuffer | ArrayBufferView,
          without?: string[]
        ) => void;
      };
    }

    schema = config.schema;

    async onConnect(connection: Party.Connection): Promise<void> {
      this.room.broadcast;
      if (config.onConnect) {
        await config.onConnect(connection, this.room);
      }
    }

    async onClose(connection: Party.Connection): Promise<void> {
      if (config.onClose) {
        await config.onClose(connection, this.room);
      }
    }

    async onMessage(message: string, sender: Party.Connection): Promise<void> {
      const { type, payload } = this.parseMessage(message);
      if (!type || !payload) {
        console.error(`Invalid message: ${message}`);
        return;
      }

      // Call the user-defined onMessage handler
      if (config.onMessage) {
        await config.onMessage({ type, payload, sender, room: this.room });
      }
    }

    private parseMessage(message: string): {
      type: keyof TSchema | null;
      payload: unknown | null;
    } {
      try {
        // Assume the message is a JSON string like: { "type": "join", "payload": { ... } }
        const parsed = JSON.parse(message);

        if (!parsed.type || !parsed.payload) {
          return { type: null, payload: null };
        }

        // Validate the payload against the schema for the given type
        const type = parsed.type as keyof TSchema;
        const schema = this.schema[type]?.toServer;

        if (!schema) {
          console.error(`Unknown message type: ${String(type)}`);
          return { type: null, payload: null };
        }

        const result = schema.safeParse(parsed.payload);
        if (!result.success) {
          console.error(
            `Invalid payload for type ${String(type)}:`,
            result.error
          );
          return { type: null, payload: null };
        }

        return { type, payload: result.data };
      } catch (error) {
        console.error(`Failed to parse message: ${message}`, error);
        return { type: null, payload: null };
      }
    }
  };
}

/*
Client API Usage:
export default function App() {
  const ws = usePartySocket({
    schema,
    host: 'localhost:1999',
    room: 'my-room',
    party: 'example',

    onOpen: () => {
      ws.send({
        type: 'join',
        payload: {
          type: 'fetch',
        },
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
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}
*/

function usePartySocket<TSchema extends MessageSchemaDefinition>(
  options: Omit<
    Parameters<typeof originalUsePartySocket>[0],
    'schema' | 'onMessage'
  > & {
    schema: TSchema;
    onMessage: (message: DiscriminatedUnion<TSchema, 'client'>) => void;
  }
): Omit<ReturnType<typeof originalUsePartySocket>, 'send' | 'onMessage'> & {
  send: (message: DiscriminatedUnion<TSchema, 'server'>) => void;
  onMessage: (message: DiscriminatedUnion<TSchema, 'client'>) => void;
} {
  const { schema, onMessage, ...restOptions } = options;

  const socket = originalUsePartySocket({
    ...restOptions,
    onMessage: (raw: MessageEvent<any>) => {
      try {
        const parsed = JSON.parse(raw.data);

        if (!parsed.type) {
          return { type: null, payload: null };
        }

        const type = parsed.type as keyof TSchema;

        if (!schema) {
          console.error(`Unknown message type: ${String(type)}`);
          return { type: null, payload: null };
        }

        const result = schema[type]?.toClient.safeParse(parsed.payload);
        if (!result.success) {
          console.error(
            `Invalid payload for type ${String(type)}:`,
            result.error
          );
          return { type: null, payload: null };
        }

        onMessage({ type, payload: result.data });
      } catch (error) {
        console.error('Failed to process incoming message:', error);
      }
    },
  });

  // Override the send method with strong typing
  const send = (message: DiscriminatedUnion<TSchema, 'server'>) => {
    socket.send(JSON.stringify(message));
  };

  return {
    ...socket,
    send,
    onMessage,
  };
}
