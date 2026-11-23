# Extension points

The core defines interfaces at the places where implementations are expected to vary. A feature that plugs into one of these interfaces can be added as a separate NestJS module without changing core code.

This keeps the core small, lets installs choose what they need, and allows modules to live outside this repository.

## Rules

1. The core never imports from an extension. Extensions import from the core.
2. An extension registers itself at startup through a registry. The core asks the registry and does not know which implementations exist.
3. Every extension point has at least one implementation in the core, so the product works without any extension.
4. Extension interfaces are versioned together with the product. A breaking change needs a new major version.

## Planned extension points

| Extension point       | Purpose                                          | Core implementation        | Examples of further implementations   |
| --------------------- | ------------------------------------------------ | -------------------------- | ------------------------------------- |
| `StorageDriver`       | Read and write files in a storage pool           | Local disk, S3-compatible  | Other object stores                   |
| `EncryptionProvider`  | Protect content and deliver keys or licenses     | None, AES-128              | Multi-DRM through a license service   |
| `DeliveryRouter`      | Choose the origin or edge for a playback request | Single origin, round robin | Routing by geography, load and health |
| `PaymentGateway`      | Charge viewers and receive payment events        | One gateway (phase 3)      | Regional gateways                     |
| `MetadataProvider`    | Import catalog metadata                          | One provider (phase 2)     | Other metadata sources                |
| `AnalyticsExporter`   | Send events and metrics elsewhere                | Database                   | External analytics systems            |
| `NotificationChannel` | Deliver notifications                            | Email                      | Push, messaging services              |

## Shape of an extension point

Each one consists of three parts:

```ts
// 1. The interface, defined in the core (shortened).
export interface StorageDriver {
  write(key: string, data: Readable | Buffer, options?: WriteOptions): Promise<void>;
  read(key: string, range?: ReadRange): Promise<Readable>;
  stat(key: string): Promise<StorageObjectInfo | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
  list(prefix: string): AsyncIterable<StorageListEntry>;
  /** Everything the driver can see, for places that are looked through as a whole. */
  listAll(): AsyncIterable<StorageListEntry>;
  localPath?(key: string): string;
  close?(): Promise<void>;
}

// 2. The registry, provided by the core.
@Injectable()
export class StorageDriverRegistry {
  register(driver: StorageDriver): void {
    /* ... */
  }
  get(type: string): StorageDriver {
    /* ... */
  }
}

// 3. An implementation, which registers itself when its module starts.
@Module({ imports: [StorageCoreModule] })
export class S3StorageModule implements OnModuleInit {
  constructor(
    private readonly registry: StorageDriverRegistry,
    private readonly driver: S3StorageDriver,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.driver);
  }
}
```

`StorageDriver` exists in `apps/api/src/storage/storage-driver.ts`, with a contract test suite every driver has to pass. Its registry is still a fixed choice between the two built-in drivers and becomes a real registry when the first external driver is needed. The other interfaces are sketches and are finalized when their modules are built.
