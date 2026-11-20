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
// 1. The interface, defined in the core.
export interface StorageDriver {
  readonly type: string;
  write(path: string, data: Readable): Promise<void>;
  read(path: string): Promise<Readable>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
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

The interfaces above are sketches. Each one is finalized when its module is built.
