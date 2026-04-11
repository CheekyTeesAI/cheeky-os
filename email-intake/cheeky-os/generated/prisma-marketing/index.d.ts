
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Customer
 * 
 */
export type Customer = $Result.DefaultSelection<Prisma.$CustomerPayload>
/**
 * Model Lead
 * 
 */
export type Lead = $Result.DefaultSelection<Prisma.$LeadPayload>
/**
 * Model CampaignLog
 * 
 */
export type CampaignLog = $Result.DefaultSelection<Prisma.$CampaignLogPayload>
/**
 * Model CaptureOrder
 * Bundle 3 — notebook / quick-capture production orders (not Square orders).
 */
export type CaptureOrder = $Result.DefaultSelection<Prisma.$CaptureOrderPayload>
/**
 * Model CaptureTask
 * 
 */
export type CaptureTask = $Result.DefaultSelection<Prisma.$CaptureTaskPayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Customers
 * const customers = await prisma.customer.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Customers
   * const customers = await prisma.customer.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs, $Utils.Call<Prisma.TypeMapCb, {
    extArgs: ExtArgs
  }>, ClientOptions>

      /**
   * `prisma.customer`: Exposes CRUD operations for the **Customer** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Customers
    * const customers = await prisma.customer.findMany()
    * ```
    */
  get customer(): Prisma.CustomerDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.lead`: Exposes CRUD operations for the **Lead** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Leads
    * const leads = await prisma.lead.findMany()
    * ```
    */
  get lead(): Prisma.LeadDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.campaignLog`: Exposes CRUD operations for the **CampaignLog** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more CampaignLogs
    * const campaignLogs = await prisma.campaignLog.findMany()
    * ```
    */
  get campaignLog(): Prisma.CampaignLogDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.captureOrder`: Exposes CRUD operations for the **CaptureOrder** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more CaptureOrders
    * const captureOrders = await prisma.captureOrder.findMany()
    * ```
    */
  get captureOrder(): Prisma.CaptureOrderDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.captureTask`: Exposes CRUD operations for the **CaptureTask** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more CaptureTasks
    * const captureTasks = await prisma.captureTask.findMany()
    * ```
    */
  get captureTask(): Prisma.CaptureTaskDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.3.0
   * Query Engine version: acc0b9dd43eb689cbd20c9470515d719db10d0b0
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Customer: 'Customer',
    Lead: 'Lead',
    CampaignLog: 'CampaignLog',
    CaptureOrder: 'CaptureOrder',
    CaptureTask: 'CaptureTask'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "customer" | "lead" | "campaignLog" | "captureOrder" | "captureTask"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Customer: {
        payload: Prisma.$CustomerPayload<ExtArgs>
        fields: Prisma.CustomerFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CustomerFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CustomerFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload>
          }
          findFirst: {
            args: Prisma.CustomerFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CustomerFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload>
          }
          findMany: {
            args: Prisma.CustomerFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload>[]
          }
          create: {
            args: Prisma.CustomerCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload>
          }
          createMany: {
            args: Prisma.CustomerCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CustomerCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload>[]
          }
          delete: {
            args: Prisma.CustomerDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload>
          }
          update: {
            args: Prisma.CustomerUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload>
          }
          deleteMany: {
            args: Prisma.CustomerDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CustomerUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.CustomerUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload>[]
          }
          upsert: {
            args: Prisma.CustomerUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CustomerPayload>
          }
          aggregate: {
            args: Prisma.CustomerAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCustomer>
          }
          groupBy: {
            args: Prisma.CustomerGroupByArgs<ExtArgs>
            result: $Utils.Optional<CustomerGroupByOutputType>[]
          }
          count: {
            args: Prisma.CustomerCountArgs<ExtArgs>
            result: $Utils.Optional<CustomerCountAggregateOutputType> | number
          }
        }
      }
      Lead: {
        payload: Prisma.$LeadPayload<ExtArgs>
        fields: Prisma.LeadFieldRefs
        operations: {
          findUnique: {
            args: Prisma.LeadFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.LeadFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload>
          }
          findFirst: {
            args: Prisma.LeadFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.LeadFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload>
          }
          findMany: {
            args: Prisma.LeadFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload>[]
          }
          create: {
            args: Prisma.LeadCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload>
          }
          createMany: {
            args: Prisma.LeadCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.LeadCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload>[]
          }
          delete: {
            args: Prisma.LeadDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload>
          }
          update: {
            args: Prisma.LeadUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload>
          }
          deleteMany: {
            args: Prisma.LeadDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.LeadUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.LeadUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload>[]
          }
          upsert: {
            args: Prisma.LeadUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LeadPayload>
          }
          aggregate: {
            args: Prisma.LeadAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateLead>
          }
          groupBy: {
            args: Prisma.LeadGroupByArgs<ExtArgs>
            result: $Utils.Optional<LeadGroupByOutputType>[]
          }
          count: {
            args: Prisma.LeadCountArgs<ExtArgs>
            result: $Utils.Optional<LeadCountAggregateOutputType> | number
          }
        }
      }
      CampaignLog: {
        payload: Prisma.$CampaignLogPayload<ExtArgs>
        fields: Prisma.CampaignLogFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CampaignLogFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CampaignLogFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload>
          }
          findFirst: {
            args: Prisma.CampaignLogFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CampaignLogFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload>
          }
          findMany: {
            args: Prisma.CampaignLogFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload>[]
          }
          create: {
            args: Prisma.CampaignLogCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload>
          }
          createMany: {
            args: Prisma.CampaignLogCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CampaignLogCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload>[]
          }
          delete: {
            args: Prisma.CampaignLogDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload>
          }
          update: {
            args: Prisma.CampaignLogUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload>
          }
          deleteMany: {
            args: Prisma.CampaignLogDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CampaignLogUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.CampaignLogUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload>[]
          }
          upsert: {
            args: Prisma.CampaignLogUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CampaignLogPayload>
          }
          aggregate: {
            args: Prisma.CampaignLogAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCampaignLog>
          }
          groupBy: {
            args: Prisma.CampaignLogGroupByArgs<ExtArgs>
            result: $Utils.Optional<CampaignLogGroupByOutputType>[]
          }
          count: {
            args: Prisma.CampaignLogCountArgs<ExtArgs>
            result: $Utils.Optional<CampaignLogCountAggregateOutputType> | number
          }
        }
      }
      CaptureOrder: {
        payload: Prisma.$CaptureOrderPayload<ExtArgs>
        fields: Prisma.CaptureOrderFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CaptureOrderFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CaptureOrderFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload>
          }
          findFirst: {
            args: Prisma.CaptureOrderFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CaptureOrderFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload>
          }
          findMany: {
            args: Prisma.CaptureOrderFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload>[]
          }
          create: {
            args: Prisma.CaptureOrderCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload>
          }
          createMany: {
            args: Prisma.CaptureOrderCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CaptureOrderCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload>[]
          }
          delete: {
            args: Prisma.CaptureOrderDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload>
          }
          update: {
            args: Prisma.CaptureOrderUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload>
          }
          deleteMany: {
            args: Prisma.CaptureOrderDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CaptureOrderUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.CaptureOrderUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload>[]
          }
          upsert: {
            args: Prisma.CaptureOrderUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureOrderPayload>
          }
          aggregate: {
            args: Prisma.CaptureOrderAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCaptureOrder>
          }
          groupBy: {
            args: Prisma.CaptureOrderGroupByArgs<ExtArgs>
            result: $Utils.Optional<CaptureOrderGroupByOutputType>[]
          }
          count: {
            args: Prisma.CaptureOrderCountArgs<ExtArgs>
            result: $Utils.Optional<CaptureOrderCountAggregateOutputType> | number
          }
        }
      }
      CaptureTask: {
        payload: Prisma.$CaptureTaskPayload<ExtArgs>
        fields: Prisma.CaptureTaskFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CaptureTaskFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CaptureTaskFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload>
          }
          findFirst: {
            args: Prisma.CaptureTaskFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CaptureTaskFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload>
          }
          findMany: {
            args: Prisma.CaptureTaskFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload>[]
          }
          create: {
            args: Prisma.CaptureTaskCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload>
          }
          createMany: {
            args: Prisma.CaptureTaskCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CaptureTaskCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload>[]
          }
          delete: {
            args: Prisma.CaptureTaskDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload>
          }
          update: {
            args: Prisma.CaptureTaskUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload>
          }
          deleteMany: {
            args: Prisma.CaptureTaskDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CaptureTaskUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.CaptureTaskUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload>[]
          }
          upsert: {
            args: Prisma.CaptureTaskUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CaptureTaskPayload>
          }
          aggregate: {
            args: Prisma.CaptureTaskAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCaptureTask>
          }
          groupBy: {
            args: Prisma.CaptureTaskGroupByArgs<ExtArgs>
            result: $Utils.Optional<CaptureTaskGroupByOutputType>[]
          }
          count: {
            args: Prisma.CaptureTaskCountArgs<ExtArgs>
            result: $Utils.Optional<CaptureTaskCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    customer?: CustomerOmit
    lead?: LeadOmit
    campaignLog?: CampaignLogOmit
    captureOrder?: CaptureOrderOmit
    captureTask?: CaptureTaskOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type CaptureOrderCountOutputType
   */

  export type CaptureOrderCountOutputType = {
    tasks: number
  }

  export type CaptureOrderCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tasks?: boolean | CaptureOrderCountOutputTypeCountTasksArgs
  }

  // Custom InputTypes
  /**
   * CaptureOrderCountOutputType without action
   */
  export type CaptureOrderCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrderCountOutputType
     */
    select?: CaptureOrderCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * CaptureOrderCountOutputType without action
   */
  export type CaptureOrderCountOutputTypeCountTasksArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CaptureTaskWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Customer
   */

  export type AggregateCustomer = {
    _count: CustomerCountAggregateOutputType | null
    _avg: CustomerAvgAggregateOutputType | null
    _sum: CustomerSumAggregateOutputType | null
    _min: CustomerMinAggregateOutputType | null
    _max: CustomerMaxAggregateOutputType | null
  }

  export type CustomerAvgAggregateOutputType = {
    totalSpent: number | null
  }

  export type CustomerSumAggregateOutputType = {
    totalSpent: number | null
  }

  export type CustomerMinAggregateOutputType = {
    id: string | null
    squareCustomerId: string | null
    name: string | null
    email: string | null
    phone: string | null
    lastOrderDate: Date | null
    totalSpent: number | null
    createdAt: Date | null
  }

  export type CustomerMaxAggregateOutputType = {
    id: string | null
    squareCustomerId: string | null
    name: string | null
    email: string | null
    phone: string | null
    lastOrderDate: Date | null
    totalSpent: number | null
    createdAt: Date | null
  }

  export type CustomerCountAggregateOutputType = {
    id: number
    squareCustomerId: number
    name: number
    email: number
    phone: number
    lastOrderDate: number
    totalSpent: number
    createdAt: number
    _all: number
  }


  export type CustomerAvgAggregateInputType = {
    totalSpent?: true
  }

  export type CustomerSumAggregateInputType = {
    totalSpent?: true
  }

  export type CustomerMinAggregateInputType = {
    id?: true
    squareCustomerId?: true
    name?: true
    email?: true
    phone?: true
    lastOrderDate?: true
    totalSpent?: true
    createdAt?: true
  }

  export type CustomerMaxAggregateInputType = {
    id?: true
    squareCustomerId?: true
    name?: true
    email?: true
    phone?: true
    lastOrderDate?: true
    totalSpent?: true
    createdAt?: true
  }

  export type CustomerCountAggregateInputType = {
    id?: true
    squareCustomerId?: true
    name?: true
    email?: true
    phone?: true
    lastOrderDate?: true
    totalSpent?: true
    createdAt?: true
    _all?: true
  }

  export type CustomerAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Customer to aggregate.
     */
    where?: CustomerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Customers to fetch.
     */
    orderBy?: CustomerOrderByWithRelationInput | CustomerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CustomerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Customers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Customers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Customers
    **/
    _count?: true | CustomerCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: CustomerAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: CustomerSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CustomerMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CustomerMaxAggregateInputType
  }

  export type GetCustomerAggregateType<T extends CustomerAggregateArgs> = {
        [P in keyof T & keyof AggregateCustomer]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCustomer[P]>
      : GetScalarType<T[P], AggregateCustomer[P]>
  }




  export type CustomerGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CustomerWhereInput
    orderBy?: CustomerOrderByWithAggregationInput | CustomerOrderByWithAggregationInput[]
    by: CustomerScalarFieldEnum[] | CustomerScalarFieldEnum
    having?: CustomerScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CustomerCountAggregateInputType | true
    _avg?: CustomerAvgAggregateInputType
    _sum?: CustomerSumAggregateInputType
    _min?: CustomerMinAggregateInputType
    _max?: CustomerMaxAggregateInputType
  }

  export type CustomerGroupByOutputType = {
    id: string
    squareCustomerId: string
    name: string | null
    email: string | null
    phone: string | null
    lastOrderDate: Date | null
    totalSpent: number
    createdAt: Date
    _count: CustomerCountAggregateOutputType | null
    _avg: CustomerAvgAggregateOutputType | null
    _sum: CustomerSumAggregateOutputType | null
    _min: CustomerMinAggregateOutputType | null
    _max: CustomerMaxAggregateOutputType | null
  }

  type GetCustomerGroupByPayload<T extends CustomerGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CustomerGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CustomerGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CustomerGroupByOutputType[P]>
            : GetScalarType<T[P], CustomerGroupByOutputType[P]>
        }
      >
    >


  export type CustomerSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    squareCustomerId?: boolean
    name?: boolean
    email?: boolean
    phone?: boolean
    lastOrderDate?: boolean
    totalSpent?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["customer"]>

  export type CustomerSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    squareCustomerId?: boolean
    name?: boolean
    email?: boolean
    phone?: boolean
    lastOrderDate?: boolean
    totalSpent?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["customer"]>

  export type CustomerSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    squareCustomerId?: boolean
    name?: boolean
    email?: boolean
    phone?: boolean
    lastOrderDate?: boolean
    totalSpent?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["customer"]>

  export type CustomerSelectScalar = {
    id?: boolean
    squareCustomerId?: boolean
    name?: boolean
    email?: boolean
    phone?: boolean
    lastOrderDate?: boolean
    totalSpent?: boolean
    createdAt?: boolean
  }

  export type CustomerOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "squareCustomerId" | "name" | "email" | "phone" | "lastOrderDate" | "totalSpent" | "createdAt", ExtArgs["result"]["customer"]>

  export type $CustomerPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Customer"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      squareCustomerId: string
      name: string | null
      email: string | null
      phone: string | null
      lastOrderDate: Date | null
      totalSpent: number
      createdAt: Date
    }, ExtArgs["result"]["customer"]>
    composites: {}
  }

  type CustomerGetPayload<S extends boolean | null | undefined | CustomerDefaultArgs> = $Result.GetResult<Prisma.$CustomerPayload, S>

  type CustomerCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<CustomerFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: CustomerCountAggregateInputType | true
    }

  export interface CustomerDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Customer'], meta: { name: 'Customer' } }
    /**
     * Find zero or one Customer that matches the filter.
     * @param {CustomerFindUniqueArgs} args - Arguments to find a Customer
     * @example
     * // Get one Customer
     * const customer = await prisma.customer.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CustomerFindUniqueArgs>(args: SelectSubset<T, CustomerFindUniqueArgs<ExtArgs>>): Prisma__CustomerClient<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one Customer that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {CustomerFindUniqueOrThrowArgs} args - Arguments to find a Customer
     * @example
     * // Get one Customer
     * const customer = await prisma.customer.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CustomerFindUniqueOrThrowArgs>(args: SelectSubset<T, CustomerFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CustomerClient<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first Customer that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CustomerFindFirstArgs} args - Arguments to find a Customer
     * @example
     * // Get one Customer
     * const customer = await prisma.customer.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CustomerFindFirstArgs>(args?: SelectSubset<T, CustomerFindFirstArgs<ExtArgs>>): Prisma__CustomerClient<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first Customer that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CustomerFindFirstOrThrowArgs} args - Arguments to find a Customer
     * @example
     * // Get one Customer
     * const customer = await prisma.customer.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CustomerFindFirstOrThrowArgs>(args?: SelectSubset<T, CustomerFindFirstOrThrowArgs<ExtArgs>>): Prisma__CustomerClient<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more Customers that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CustomerFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Customers
     * const customers = await prisma.customer.findMany()
     * 
     * // Get first 10 Customers
     * const customers = await prisma.customer.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const customerWithIdOnly = await prisma.customer.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CustomerFindManyArgs>(args?: SelectSubset<T, CustomerFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a Customer.
     * @param {CustomerCreateArgs} args - Arguments to create a Customer.
     * @example
     * // Create one Customer
     * const Customer = await prisma.customer.create({
     *   data: {
     *     // ... data to create a Customer
     *   }
     * })
     * 
     */
    create<T extends CustomerCreateArgs>(args: SelectSubset<T, CustomerCreateArgs<ExtArgs>>): Prisma__CustomerClient<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many Customers.
     * @param {CustomerCreateManyArgs} args - Arguments to create many Customers.
     * @example
     * // Create many Customers
     * const customer = await prisma.customer.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CustomerCreateManyArgs>(args?: SelectSubset<T, CustomerCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Customers and returns the data saved in the database.
     * @param {CustomerCreateManyAndReturnArgs} args - Arguments to create many Customers.
     * @example
     * // Create many Customers
     * const customer = await prisma.customer.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Customers and only return the `id`
     * const customerWithIdOnly = await prisma.customer.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CustomerCreateManyAndReturnArgs>(args?: SelectSubset<T, CustomerCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a Customer.
     * @param {CustomerDeleteArgs} args - Arguments to delete one Customer.
     * @example
     * // Delete one Customer
     * const Customer = await prisma.customer.delete({
     *   where: {
     *     // ... filter to delete one Customer
     *   }
     * })
     * 
     */
    delete<T extends CustomerDeleteArgs>(args: SelectSubset<T, CustomerDeleteArgs<ExtArgs>>): Prisma__CustomerClient<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one Customer.
     * @param {CustomerUpdateArgs} args - Arguments to update one Customer.
     * @example
     * // Update one Customer
     * const customer = await prisma.customer.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CustomerUpdateArgs>(args: SelectSubset<T, CustomerUpdateArgs<ExtArgs>>): Prisma__CustomerClient<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more Customers.
     * @param {CustomerDeleteManyArgs} args - Arguments to filter Customers to delete.
     * @example
     * // Delete a few Customers
     * const { count } = await prisma.customer.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CustomerDeleteManyArgs>(args?: SelectSubset<T, CustomerDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Customers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CustomerUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Customers
     * const customer = await prisma.customer.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CustomerUpdateManyArgs>(args: SelectSubset<T, CustomerUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Customers and returns the data updated in the database.
     * @param {CustomerUpdateManyAndReturnArgs} args - Arguments to update many Customers.
     * @example
     * // Update many Customers
     * const customer = await prisma.customer.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Customers and only return the `id`
     * const customerWithIdOnly = await prisma.customer.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends CustomerUpdateManyAndReturnArgs>(args: SelectSubset<T, CustomerUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one Customer.
     * @param {CustomerUpsertArgs} args - Arguments to update or create a Customer.
     * @example
     * // Update or create a Customer
     * const customer = await prisma.customer.upsert({
     *   create: {
     *     // ... data to create a Customer
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Customer we want to update
     *   }
     * })
     */
    upsert<T extends CustomerUpsertArgs>(args: SelectSubset<T, CustomerUpsertArgs<ExtArgs>>): Prisma__CustomerClient<$Result.GetResult<Prisma.$CustomerPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of Customers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CustomerCountArgs} args - Arguments to filter Customers to count.
     * @example
     * // Count the number of Customers
     * const count = await prisma.customer.count({
     *   where: {
     *     // ... the filter for the Customers we want to count
     *   }
     * })
    **/
    count<T extends CustomerCountArgs>(
      args?: Subset<T, CustomerCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CustomerCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Customer.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CustomerAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CustomerAggregateArgs>(args: Subset<T, CustomerAggregateArgs>): Prisma.PrismaPromise<GetCustomerAggregateType<T>>

    /**
     * Group by Customer.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CustomerGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CustomerGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CustomerGroupByArgs['orderBy'] }
        : { orderBy?: CustomerGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CustomerGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCustomerGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Customer model
   */
  readonly fields: CustomerFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Customer.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CustomerClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Customer model
   */ 
  interface CustomerFieldRefs {
    readonly id: FieldRef<"Customer", 'String'>
    readonly squareCustomerId: FieldRef<"Customer", 'String'>
    readonly name: FieldRef<"Customer", 'String'>
    readonly email: FieldRef<"Customer", 'String'>
    readonly phone: FieldRef<"Customer", 'String'>
    readonly lastOrderDate: FieldRef<"Customer", 'DateTime'>
    readonly totalSpent: FieldRef<"Customer", 'Float'>
    readonly createdAt: FieldRef<"Customer", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Customer findUnique
   */
  export type CustomerFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * Filter, which Customer to fetch.
     */
    where: CustomerWhereUniqueInput
  }

  /**
   * Customer findUniqueOrThrow
   */
  export type CustomerFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * Filter, which Customer to fetch.
     */
    where: CustomerWhereUniqueInput
  }

  /**
   * Customer findFirst
   */
  export type CustomerFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * Filter, which Customer to fetch.
     */
    where?: CustomerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Customers to fetch.
     */
    orderBy?: CustomerOrderByWithRelationInput | CustomerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Customers.
     */
    cursor?: CustomerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Customers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Customers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Customers.
     */
    distinct?: CustomerScalarFieldEnum | CustomerScalarFieldEnum[]
  }

  /**
   * Customer findFirstOrThrow
   */
  export type CustomerFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * Filter, which Customer to fetch.
     */
    where?: CustomerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Customers to fetch.
     */
    orderBy?: CustomerOrderByWithRelationInput | CustomerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Customers.
     */
    cursor?: CustomerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Customers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Customers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Customers.
     */
    distinct?: CustomerScalarFieldEnum | CustomerScalarFieldEnum[]
  }

  /**
   * Customer findMany
   */
  export type CustomerFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * Filter, which Customers to fetch.
     */
    where?: CustomerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Customers to fetch.
     */
    orderBy?: CustomerOrderByWithRelationInput | CustomerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Customers.
     */
    cursor?: CustomerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Customers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Customers.
     */
    skip?: number
    distinct?: CustomerScalarFieldEnum | CustomerScalarFieldEnum[]
  }

  /**
   * Customer create
   */
  export type CustomerCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * The data needed to create a Customer.
     */
    data: XOR<CustomerCreateInput, CustomerUncheckedCreateInput>
  }

  /**
   * Customer createMany
   */
  export type CustomerCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Customers.
     */
    data: CustomerCreateManyInput | CustomerCreateManyInput[]
  }

  /**
   * Customer createManyAndReturn
   */
  export type CustomerCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * The data used to create many Customers.
     */
    data: CustomerCreateManyInput | CustomerCreateManyInput[]
  }

  /**
   * Customer update
   */
  export type CustomerUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * The data needed to update a Customer.
     */
    data: XOR<CustomerUpdateInput, CustomerUncheckedUpdateInput>
    /**
     * Choose, which Customer to update.
     */
    where: CustomerWhereUniqueInput
  }

  /**
   * Customer updateMany
   */
  export type CustomerUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Customers.
     */
    data: XOR<CustomerUpdateManyMutationInput, CustomerUncheckedUpdateManyInput>
    /**
     * Filter which Customers to update
     */
    where?: CustomerWhereInput
    /**
     * Limit how many Customers to update.
     */
    limit?: number
  }

  /**
   * Customer updateManyAndReturn
   */
  export type CustomerUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * The data used to update Customers.
     */
    data: XOR<CustomerUpdateManyMutationInput, CustomerUncheckedUpdateManyInput>
    /**
     * Filter which Customers to update
     */
    where?: CustomerWhereInput
    /**
     * Limit how many Customers to update.
     */
    limit?: number
  }

  /**
   * Customer upsert
   */
  export type CustomerUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * The filter to search for the Customer to update in case it exists.
     */
    where: CustomerWhereUniqueInput
    /**
     * In case the Customer found by the `where` argument doesn't exist, create a new Customer with this data.
     */
    create: XOR<CustomerCreateInput, CustomerUncheckedCreateInput>
    /**
     * In case the Customer was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CustomerUpdateInput, CustomerUncheckedUpdateInput>
  }

  /**
   * Customer delete
   */
  export type CustomerDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
    /**
     * Filter which Customer to delete.
     */
    where: CustomerWhereUniqueInput
  }

  /**
   * Customer deleteMany
   */
  export type CustomerDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Customers to delete
     */
    where?: CustomerWhereInput
    /**
     * Limit how many Customers to delete.
     */
    limit?: number
  }

  /**
   * Customer without action
   */
  export type CustomerDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Customer
     */
    select?: CustomerSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Customer
     */
    omit?: CustomerOmit<ExtArgs> | null
  }


  /**
   * Model Lead
   */

  export type AggregateLead = {
    _count: LeadCountAggregateOutputType | null
    _min: LeadMinAggregateOutputType | null
    _max: LeadMaxAggregateOutputType | null
  }

  export type LeadMinAggregateOutputType = {
    id: string | null
    name: string | null
    email: string | null
    phone: string | null
    source: string | null
    createdAt: Date | null
  }

  export type LeadMaxAggregateOutputType = {
    id: string | null
    name: string | null
    email: string | null
    phone: string | null
    source: string | null
    createdAt: Date | null
  }

  export type LeadCountAggregateOutputType = {
    id: number
    name: number
    email: number
    phone: number
    source: number
    createdAt: number
    _all: number
  }


  export type LeadMinAggregateInputType = {
    id?: true
    name?: true
    email?: true
    phone?: true
    source?: true
    createdAt?: true
  }

  export type LeadMaxAggregateInputType = {
    id?: true
    name?: true
    email?: true
    phone?: true
    source?: true
    createdAt?: true
  }

  export type LeadCountAggregateInputType = {
    id?: true
    name?: true
    email?: true
    phone?: true
    source?: true
    createdAt?: true
    _all?: true
  }

  export type LeadAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Lead to aggregate.
     */
    where?: LeadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Leads to fetch.
     */
    orderBy?: LeadOrderByWithRelationInput | LeadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: LeadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Leads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Leads.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Leads
    **/
    _count?: true | LeadCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: LeadMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: LeadMaxAggregateInputType
  }

  export type GetLeadAggregateType<T extends LeadAggregateArgs> = {
        [P in keyof T & keyof AggregateLead]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateLead[P]>
      : GetScalarType<T[P], AggregateLead[P]>
  }




  export type LeadGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: LeadWhereInput
    orderBy?: LeadOrderByWithAggregationInput | LeadOrderByWithAggregationInput[]
    by: LeadScalarFieldEnum[] | LeadScalarFieldEnum
    having?: LeadScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: LeadCountAggregateInputType | true
    _min?: LeadMinAggregateInputType
    _max?: LeadMaxAggregateInputType
  }

  export type LeadGroupByOutputType = {
    id: string
    name: string
    email: string | null
    phone: string | null
    source: string
    createdAt: Date
    _count: LeadCountAggregateOutputType | null
    _min: LeadMinAggregateOutputType | null
    _max: LeadMaxAggregateOutputType | null
  }

  type GetLeadGroupByPayload<T extends LeadGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<LeadGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof LeadGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], LeadGroupByOutputType[P]>
            : GetScalarType<T[P], LeadGroupByOutputType[P]>
        }
      >
    >


  export type LeadSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    email?: boolean
    phone?: boolean
    source?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["lead"]>

  export type LeadSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    email?: boolean
    phone?: boolean
    source?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["lead"]>

  export type LeadSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    email?: boolean
    phone?: boolean
    source?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["lead"]>

  export type LeadSelectScalar = {
    id?: boolean
    name?: boolean
    email?: boolean
    phone?: boolean
    source?: boolean
    createdAt?: boolean
  }

  export type LeadOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "name" | "email" | "phone" | "source" | "createdAt", ExtArgs["result"]["lead"]>

  export type $LeadPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Lead"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      email: string | null
      phone: string | null
      source: string
      createdAt: Date
    }, ExtArgs["result"]["lead"]>
    composites: {}
  }

  type LeadGetPayload<S extends boolean | null | undefined | LeadDefaultArgs> = $Result.GetResult<Prisma.$LeadPayload, S>

  type LeadCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<LeadFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: LeadCountAggregateInputType | true
    }

  export interface LeadDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Lead'], meta: { name: 'Lead' } }
    /**
     * Find zero or one Lead that matches the filter.
     * @param {LeadFindUniqueArgs} args - Arguments to find a Lead
     * @example
     * // Get one Lead
     * const lead = await prisma.lead.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends LeadFindUniqueArgs>(args: SelectSubset<T, LeadFindUniqueArgs<ExtArgs>>): Prisma__LeadClient<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one Lead that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {LeadFindUniqueOrThrowArgs} args - Arguments to find a Lead
     * @example
     * // Get one Lead
     * const lead = await prisma.lead.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends LeadFindUniqueOrThrowArgs>(args: SelectSubset<T, LeadFindUniqueOrThrowArgs<ExtArgs>>): Prisma__LeadClient<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first Lead that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LeadFindFirstArgs} args - Arguments to find a Lead
     * @example
     * // Get one Lead
     * const lead = await prisma.lead.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends LeadFindFirstArgs>(args?: SelectSubset<T, LeadFindFirstArgs<ExtArgs>>): Prisma__LeadClient<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first Lead that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LeadFindFirstOrThrowArgs} args - Arguments to find a Lead
     * @example
     * // Get one Lead
     * const lead = await prisma.lead.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends LeadFindFirstOrThrowArgs>(args?: SelectSubset<T, LeadFindFirstOrThrowArgs<ExtArgs>>): Prisma__LeadClient<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more Leads that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LeadFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Leads
     * const leads = await prisma.lead.findMany()
     * 
     * // Get first 10 Leads
     * const leads = await prisma.lead.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const leadWithIdOnly = await prisma.lead.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends LeadFindManyArgs>(args?: SelectSubset<T, LeadFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a Lead.
     * @param {LeadCreateArgs} args - Arguments to create a Lead.
     * @example
     * // Create one Lead
     * const Lead = await prisma.lead.create({
     *   data: {
     *     // ... data to create a Lead
     *   }
     * })
     * 
     */
    create<T extends LeadCreateArgs>(args: SelectSubset<T, LeadCreateArgs<ExtArgs>>): Prisma__LeadClient<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many Leads.
     * @param {LeadCreateManyArgs} args - Arguments to create many Leads.
     * @example
     * // Create many Leads
     * const lead = await prisma.lead.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends LeadCreateManyArgs>(args?: SelectSubset<T, LeadCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Leads and returns the data saved in the database.
     * @param {LeadCreateManyAndReturnArgs} args - Arguments to create many Leads.
     * @example
     * // Create many Leads
     * const lead = await prisma.lead.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Leads and only return the `id`
     * const leadWithIdOnly = await prisma.lead.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends LeadCreateManyAndReturnArgs>(args?: SelectSubset<T, LeadCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a Lead.
     * @param {LeadDeleteArgs} args - Arguments to delete one Lead.
     * @example
     * // Delete one Lead
     * const Lead = await prisma.lead.delete({
     *   where: {
     *     // ... filter to delete one Lead
     *   }
     * })
     * 
     */
    delete<T extends LeadDeleteArgs>(args: SelectSubset<T, LeadDeleteArgs<ExtArgs>>): Prisma__LeadClient<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one Lead.
     * @param {LeadUpdateArgs} args - Arguments to update one Lead.
     * @example
     * // Update one Lead
     * const lead = await prisma.lead.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends LeadUpdateArgs>(args: SelectSubset<T, LeadUpdateArgs<ExtArgs>>): Prisma__LeadClient<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more Leads.
     * @param {LeadDeleteManyArgs} args - Arguments to filter Leads to delete.
     * @example
     * // Delete a few Leads
     * const { count } = await prisma.lead.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends LeadDeleteManyArgs>(args?: SelectSubset<T, LeadDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Leads.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LeadUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Leads
     * const lead = await prisma.lead.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends LeadUpdateManyArgs>(args: SelectSubset<T, LeadUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Leads and returns the data updated in the database.
     * @param {LeadUpdateManyAndReturnArgs} args - Arguments to update many Leads.
     * @example
     * // Update many Leads
     * const lead = await prisma.lead.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Leads and only return the `id`
     * const leadWithIdOnly = await prisma.lead.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends LeadUpdateManyAndReturnArgs>(args: SelectSubset<T, LeadUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one Lead.
     * @param {LeadUpsertArgs} args - Arguments to update or create a Lead.
     * @example
     * // Update or create a Lead
     * const lead = await prisma.lead.upsert({
     *   create: {
     *     // ... data to create a Lead
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Lead we want to update
     *   }
     * })
     */
    upsert<T extends LeadUpsertArgs>(args: SelectSubset<T, LeadUpsertArgs<ExtArgs>>): Prisma__LeadClient<$Result.GetResult<Prisma.$LeadPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of Leads.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LeadCountArgs} args - Arguments to filter Leads to count.
     * @example
     * // Count the number of Leads
     * const count = await prisma.lead.count({
     *   where: {
     *     // ... the filter for the Leads we want to count
     *   }
     * })
    **/
    count<T extends LeadCountArgs>(
      args?: Subset<T, LeadCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], LeadCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Lead.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LeadAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends LeadAggregateArgs>(args: Subset<T, LeadAggregateArgs>): Prisma.PrismaPromise<GetLeadAggregateType<T>>

    /**
     * Group by Lead.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LeadGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends LeadGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: LeadGroupByArgs['orderBy'] }
        : { orderBy?: LeadGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, LeadGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetLeadGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Lead model
   */
  readonly fields: LeadFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Lead.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__LeadClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Lead model
   */ 
  interface LeadFieldRefs {
    readonly id: FieldRef<"Lead", 'String'>
    readonly name: FieldRef<"Lead", 'String'>
    readonly email: FieldRef<"Lead", 'String'>
    readonly phone: FieldRef<"Lead", 'String'>
    readonly source: FieldRef<"Lead", 'String'>
    readonly createdAt: FieldRef<"Lead", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Lead findUnique
   */
  export type LeadFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * Filter, which Lead to fetch.
     */
    where: LeadWhereUniqueInput
  }

  /**
   * Lead findUniqueOrThrow
   */
  export type LeadFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * Filter, which Lead to fetch.
     */
    where: LeadWhereUniqueInput
  }

  /**
   * Lead findFirst
   */
  export type LeadFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * Filter, which Lead to fetch.
     */
    where?: LeadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Leads to fetch.
     */
    orderBy?: LeadOrderByWithRelationInput | LeadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Leads.
     */
    cursor?: LeadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Leads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Leads.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Leads.
     */
    distinct?: LeadScalarFieldEnum | LeadScalarFieldEnum[]
  }

  /**
   * Lead findFirstOrThrow
   */
  export type LeadFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * Filter, which Lead to fetch.
     */
    where?: LeadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Leads to fetch.
     */
    orderBy?: LeadOrderByWithRelationInput | LeadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Leads.
     */
    cursor?: LeadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Leads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Leads.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Leads.
     */
    distinct?: LeadScalarFieldEnum | LeadScalarFieldEnum[]
  }

  /**
   * Lead findMany
   */
  export type LeadFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * Filter, which Leads to fetch.
     */
    where?: LeadWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Leads to fetch.
     */
    orderBy?: LeadOrderByWithRelationInput | LeadOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Leads.
     */
    cursor?: LeadWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Leads from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Leads.
     */
    skip?: number
    distinct?: LeadScalarFieldEnum | LeadScalarFieldEnum[]
  }

  /**
   * Lead create
   */
  export type LeadCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * The data needed to create a Lead.
     */
    data: XOR<LeadCreateInput, LeadUncheckedCreateInput>
  }

  /**
   * Lead createMany
   */
  export type LeadCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Leads.
     */
    data: LeadCreateManyInput | LeadCreateManyInput[]
  }

  /**
   * Lead createManyAndReturn
   */
  export type LeadCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * The data used to create many Leads.
     */
    data: LeadCreateManyInput | LeadCreateManyInput[]
  }

  /**
   * Lead update
   */
  export type LeadUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * The data needed to update a Lead.
     */
    data: XOR<LeadUpdateInput, LeadUncheckedUpdateInput>
    /**
     * Choose, which Lead to update.
     */
    where: LeadWhereUniqueInput
  }

  /**
   * Lead updateMany
   */
  export type LeadUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Leads.
     */
    data: XOR<LeadUpdateManyMutationInput, LeadUncheckedUpdateManyInput>
    /**
     * Filter which Leads to update
     */
    where?: LeadWhereInput
    /**
     * Limit how many Leads to update.
     */
    limit?: number
  }

  /**
   * Lead updateManyAndReturn
   */
  export type LeadUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * The data used to update Leads.
     */
    data: XOR<LeadUpdateManyMutationInput, LeadUncheckedUpdateManyInput>
    /**
     * Filter which Leads to update
     */
    where?: LeadWhereInput
    /**
     * Limit how many Leads to update.
     */
    limit?: number
  }

  /**
   * Lead upsert
   */
  export type LeadUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * The filter to search for the Lead to update in case it exists.
     */
    where: LeadWhereUniqueInput
    /**
     * In case the Lead found by the `where` argument doesn't exist, create a new Lead with this data.
     */
    create: XOR<LeadCreateInput, LeadUncheckedCreateInput>
    /**
     * In case the Lead was found with the provided `where` argument, update it with this data.
     */
    update: XOR<LeadUpdateInput, LeadUncheckedUpdateInput>
  }

  /**
   * Lead delete
   */
  export type LeadDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
    /**
     * Filter which Lead to delete.
     */
    where: LeadWhereUniqueInput
  }

  /**
   * Lead deleteMany
   */
  export type LeadDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Leads to delete
     */
    where?: LeadWhereInput
    /**
     * Limit how many Leads to delete.
     */
    limit?: number
  }

  /**
   * Lead without action
   */
  export type LeadDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Lead
     */
    select?: LeadSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Lead
     */
    omit?: LeadOmit<ExtArgs> | null
  }


  /**
   * Model CampaignLog
   */

  export type AggregateCampaignLog = {
    _count: CampaignLogCountAggregateOutputType | null
    _min: CampaignLogMinAggregateOutputType | null
    _max: CampaignLogMaxAggregateOutputType | null
  }

  export type CampaignLogMinAggregateOutputType = {
    id: string | null
    type: string | null
    status: string | null
    recipient: string | null
    createdAt: Date | null
  }

  export type CampaignLogMaxAggregateOutputType = {
    id: string | null
    type: string | null
    status: string | null
    recipient: string | null
    createdAt: Date | null
  }

  export type CampaignLogCountAggregateOutputType = {
    id: number
    type: number
    status: number
    recipient: number
    createdAt: number
    _all: number
  }


  export type CampaignLogMinAggregateInputType = {
    id?: true
    type?: true
    status?: true
    recipient?: true
    createdAt?: true
  }

  export type CampaignLogMaxAggregateInputType = {
    id?: true
    type?: true
    status?: true
    recipient?: true
    createdAt?: true
  }

  export type CampaignLogCountAggregateInputType = {
    id?: true
    type?: true
    status?: true
    recipient?: true
    createdAt?: true
    _all?: true
  }

  export type CampaignLogAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CampaignLog to aggregate.
     */
    where?: CampaignLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CampaignLogs to fetch.
     */
    orderBy?: CampaignLogOrderByWithRelationInput | CampaignLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CampaignLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CampaignLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CampaignLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned CampaignLogs
    **/
    _count?: true | CampaignLogCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CampaignLogMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CampaignLogMaxAggregateInputType
  }

  export type GetCampaignLogAggregateType<T extends CampaignLogAggregateArgs> = {
        [P in keyof T & keyof AggregateCampaignLog]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCampaignLog[P]>
      : GetScalarType<T[P], AggregateCampaignLog[P]>
  }




  export type CampaignLogGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CampaignLogWhereInput
    orderBy?: CampaignLogOrderByWithAggregationInput | CampaignLogOrderByWithAggregationInput[]
    by: CampaignLogScalarFieldEnum[] | CampaignLogScalarFieldEnum
    having?: CampaignLogScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CampaignLogCountAggregateInputType | true
    _min?: CampaignLogMinAggregateInputType
    _max?: CampaignLogMaxAggregateInputType
  }

  export type CampaignLogGroupByOutputType = {
    id: string
    type: string
    status: string
    recipient: string
    createdAt: Date
    _count: CampaignLogCountAggregateOutputType | null
    _min: CampaignLogMinAggregateOutputType | null
    _max: CampaignLogMaxAggregateOutputType | null
  }

  type GetCampaignLogGroupByPayload<T extends CampaignLogGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CampaignLogGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CampaignLogGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CampaignLogGroupByOutputType[P]>
            : GetScalarType<T[P], CampaignLogGroupByOutputType[P]>
        }
      >
    >


  export type CampaignLogSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    status?: boolean
    recipient?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["campaignLog"]>

  export type CampaignLogSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    status?: boolean
    recipient?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["campaignLog"]>

  export type CampaignLogSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    status?: boolean
    recipient?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["campaignLog"]>

  export type CampaignLogSelectScalar = {
    id?: boolean
    type?: boolean
    status?: boolean
    recipient?: boolean
    createdAt?: boolean
  }

  export type CampaignLogOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "type" | "status" | "recipient" | "createdAt", ExtArgs["result"]["campaignLog"]>

  export type $CampaignLogPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "CampaignLog"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      type: string
      status: string
      recipient: string
      createdAt: Date
    }, ExtArgs["result"]["campaignLog"]>
    composites: {}
  }

  type CampaignLogGetPayload<S extends boolean | null | undefined | CampaignLogDefaultArgs> = $Result.GetResult<Prisma.$CampaignLogPayload, S>

  type CampaignLogCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<CampaignLogFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: CampaignLogCountAggregateInputType | true
    }

  export interface CampaignLogDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['CampaignLog'], meta: { name: 'CampaignLog' } }
    /**
     * Find zero or one CampaignLog that matches the filter.
     * @param {CampaignLogFindUniqueArgs} args - Arguments to find a CampaignLog
     * @example
     * // Get one CampaignLog
     * const campaignLog = await prisma.campaignLog.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CampaignLogFindUniqueArgs>(args: SelectSubset<T, CampaignLogFindUniqueArgs<ExtArgs>>): Prisma__CampaignLogClient<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one CampaignLog that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {CampaignLogFindUniqueOrThrowArgs} args - Arguments to find a CampaignLog
     * @example
     * // Get one CampaignLog
     * const campaignLog = await prisma.campaignLog.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CampaignLogFindUniqueOrThrowArgs>(args: SelectSubset<T, CampaignLogFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CampaignLogClient<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first CampaignLog that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CampaignLogFindFirstArgs} args - Arguments to find a CampaignLog
     * @example
     * // Get one CampaignLog
     * const campaignLog = await prisma.campaignLog.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CampaignLogFindFirstArgs>(args?: SelectSubset<T, CampaignLogFindFirstArgs<ExtArgs>>): Prisma__CampaignLogClient<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first CampaignLog that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CampaignLogFindFirstOrThrowArgs} args - Arguments to find a CampaignLog
     * @example
     * // Get one CampaignLog
     * const campaignLog = await prisma.campaignLog.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CampaignLogFindFirstOrThrowArgs>(args?: SelectSubset<T, CampaignLogFindFirstOrThrowArgs<ExtArgs>>): Prisma__CampaignLogClient<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more CampaignLogs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CampaignLogFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all CampaignLogs
     * const campaignLogs = await prisma.campaignLog.findMany()
     * 
     * // Get first 10 CampaignLogs
     * const campaignLogs = await prisma.campaignLog.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const campaignLogWithIdOnly = await prisma.campaignLog.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CampaignLogFindManyArgs>(args?: SelectSubset<T, CampaignLogFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a CampaignLog.
     * @param {CampaignLogCreateArgs} args - Arguments to create a CampaignLog.
     * @example
     * // Create one CampaignLog
     * const CampaignLog = await prisma.campaignLog.create({
     *   data: {
     *     // ... data to create a CampaignLog
     *   }
     * })
     * 
     */
    create<T extends CampaignLogCreateArgs>(args: SelectSubset<T, CampaignLogCreateArgs<ExtArgs>>): Prisma__CampaignLogClient<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many CampaignLogs.
     * @param {CampaignLogCreateManyArgs} args - Arguments to create many CampaignLogs.
     * @example
     * // Create many CampaignLogs
     * const campaignLog = await prisma.campaignLog.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CampaignLogCreateManyArgs>(args?: SelectSubset<T, CampaignLogCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many CampaignLogs and returns the data saved in the database.
     * @param {CampaignLogCreateManyAndReturnArgs} args - Arguments to create many CampaignLogs.
     * @example
     * // Create many CampaignLogs
     * const campaignLog = await prisma.campaignLog.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many CampaignLogs and only return the `id`
     * const campaignLogWithIdOnly = await prisma.campaignLog.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CampaignLogCreateManyAndReturnArgs>(args?: SelectSubset<T, CampaignLogCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a CampaignLog.
     * @param {CampaignLogDeleteArgs} args - Arguments to delete one CampaignLog.
     * @example
     * // Delete one CampaignLog
     * const CampaignLog = await prisma.campaignLog.delete({
     *   where: {
     *     // ... filter to delete one CampaignLog
     *   }
     * })
     * 
     */
    delete<T extends CampaignLogDeleteArgs>(args: SelectSubset<T, CampaignLogDeleteArgs<ExtArgs>>): Prisma__CampaignLogClient<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one CampaignLog.
     * @param {CampaignLogUpdateArgs} args - Arguments to update one CampaignLog.
     * @example
     * // Update one CampaignLog
     * const campaignLog = await prisma.campaignLog.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CampaignLogUpdateArgs>(args: SelectSubset<T, CampaignLogUpdateArgs<ExtArgs>>): Prisma__CampaignLogClient<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more CampaignLogs.
     * @param {CampaignLogDeleteManyArgs} args - Arguments to filter CampaignLogs to delete.
     * @example
     * // Delete a few CampaignLogs
     * const { count } = await prisma.campaignLog.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CampaignLogDeleteManyArgs>(args?: SelectSubset<T, CampaignLogDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CampaignLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CampaignLogUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many CampaignLogs
     * const campaignLog = await prisma.campaignLog.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CampaignLogUpdateManyArgs>(args: SelectSubset<T, CampaignLogUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CampaignLogs and returns the data updated in the database.
     * @param {CampaignLogUpdateManyAndReturnArgs} args - Arguments to update many CampaignLogs.
     * @example
     * // Update many CampaignLogs
     * const campaignLog = await prisma.campaignLog.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more CampaignLogs and only return the `id`
     * const campaignLogWithIdOnly = await prisma.campaignLog.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends CampaignLogUpdateManyAndReturnArgs>(args: SelectSubset<T, CampaignLogUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one CampaignLog.
     * @param {CampaignLogUpsertArgs} args - Arguments to update or create a CampaignLog.
     * @example
     * // Update or create a CampaignLog
     * const campaignLog = await prisma.campaignLog.upsert({
     *   create: {
     *     // ... data to create a CampaignLog
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the CampaignLog we want to update
     *   }
     * })
     */
    upsert<T extends CampaignLogUpsertArgs>(args: SelectSubset<T, CampaignLogUpsertArgs<ExtArgs>>): Prisma__CampaignLogClient<$Result.GetResult<Prisma.$CampaignLogPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of CampaignLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CampaignLogCountArgs} args - Arguments to filter CampaignLogs to count.
     * @example
     * // Count the number of CampaignLogs
     * const count = await prisma.campaignLog.count({
     *   where: {
     *     // ... the filter for the CampaignLogs we want to count
     *   }
     * })
    **/
    count<T extends CampaignLogCountArgs>(
      args?: Subset<T, CampaignLogCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CampaignLogCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a CampaignLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CampaignLogAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CampaignLogAggregateArgs>(args: Subset<T, CampaignLogAggregateArgs>): Prisma.PrismaPromise<GetCampaignLogAggregateType<T>>

    /**
     * Group by CampaignLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CampaignLogGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CampaignLogGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CampaignLogGroupByArgs['orderBy'] }
        : { orderBy?: CampaignLogGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CampaignLogGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCampaignLogGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the CampaignLog model
   */
  readonly fields: CampaignLogFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for CampaignLog.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CampaignLogClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the CampaignLog model
   */ 
  interface CampaignLogFieldRefs {
    readonly id: FieldRef<"CampaignLog", 'String'>
    readonly type: FieldRef<"CampaignLog", 'String'>
    readonly status: FieldRef<"CampaignLog", 'String'>
    readonly recipient: FieldRef<"CampaignLog", 'String'>
    readonly createdAt: FieldRef<"CampaignLog", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * CampaignLog findUnique
   */
  export type CampaignLogFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * Filter, which CampaignLog to fetch.
     */
    where: CampaignLogWhereUniqueInput
  }

  /**
   * CampaignLog findUniqueOrThrow
   */
  export type CampaignLogFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * Filter, which CampaignLog to fetch.
     */
    where: CampaignLogWhereUniqueInput
  }

  /**
   * CampaignLog findFirst
   */
  export type CampaignLogFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * Filter, which CampaignLog to fetch.
     */
    where?: CampaignLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CampaignLogs to fetch.
     */
    orderBy?: CampaignLogOrderByWithRelationInput | CampaignLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CampaignLogs.
     */
    cursor?: CampaignLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CampaignLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CampaignLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CampaignLogs.
     */
    distinct?: CampaignLogScalarFieldEnum | CampaignLogScalarFieldEnum[]
  }

  /**
   * CampaignLog findFirstOrThrow
   */
  export type CampaignLogFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * Filter, which CampaignLog to fetch.
     */
    where?: CampaignLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CampaignLogs to fetch.
     */
    orderBy?: CampaignLogOrderByWithRelationInput | CampaignLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CampaignLogs.
     */
    cursor?: CampaignLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CampaignLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CampaignLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CampaignLogs.
     */
    distinct?: CampaignLogScalarFieldEnum | CampaignLogScalarFieldEnum[]
  }

  /**
   * CampaignLog findMany
   */
  export type CampaignLogFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * Filter, which CampaignLogs to fetch.
     */
    where?: CampaignLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CampaignLogs to fetch.
     */
    orderBy?: CampaignLogOrderByWithRelationInput | CampaignLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing CampaignLogs.
     */
    cursor?: CampaignLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CampaignLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CampaignLogs.
     */
    skip?: number
    distinct?: CampaignLogScalarFieldEnum | CampaignLogScalarFieldEnum[]
  }

  /**
   * CampaignLog create
   */
  export type CampaignLogCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * The data needed to create a CampaignLog.
     */
    data: XOR<CampaignLogCreateInput, CampaignLogUncheckedCreateInput>
  }

  /**
   * CampaignLog createMany
   */
  export type CampaignLogCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many CampaignLogs.
     */
    data: CampaignLogCreateManyInput | CampaignLogCreateManyInput[]
  }

  /**
   * CampaignLog createManyAndReturn
   */
  export type CampaignLogCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * The data used to create many CampaignLogs.
     */
    data: CampaignLogCreateManyInput | CampaignLogCreateManyInput[]
  }

  /**
   * CampaignLog update
   */
  export type CampaignLogUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * The data needed to update a CampaignLog.
     */
    data: XOR<CampaignLogUpdateInput, CampaignLogUncheckedUpdateInput>
    /**
     * Choose, which CampaignLog to update.
     */
    where: CampaignLogWhereUniqueInput
  }

  /**
   * CampaignLog updateMany
   */
  export type CampaignLogUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update CampaignLogs.
     */
    data: XOR<CampaignLogUpdateManyMutationInput, CampaignLogUncheckedUpdateManyInput>
    /**
     * Filter which CampaignLogs to update
     */
    where?: CampaignLogWhereInput
    /**
     * Limit how many CampaignLogs to update.
     */
    limit?: number
  }

  /**
   * CampaignLog updateManyAndReturn
   */
  export type CampaignLogUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * The data used to update CampaignLogs.
     */
    data: XOR<CampaignLogUpdateManyMutationInput, CampaignLogUncheckedUpdateManyInput>
    /**
     * Filter which CampaignLogs to update
     */
    where?: CampaignLogWhereInput
    /**
     * Limit how many CampaignLogs to update.
     */
    limit?: number
  }

  /**
   * CampaignLog upsert
   */
  export type CampaignLogUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * The filter to search for the CampaignLog to update in case it exists.
     */
    where: CampaignLogWhereUniqueInput
    /**
     * In case the CampaignLog found by the `where` argument doesn't exist, create a new CampaignLog with this data.
     */
    create: XOR<CampaignLogCreateInput, CampaignLogUncheckedCreateInput>
    /**
     * In case the CampaignLog was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CampaignLogUpdateInput, CampaignLogUncheckedUpdateInput>
  }

  /**
   * CampaignLog delete
   */
  export type CampaignLogDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
    /**
     * Filter which CampaignLog to delete.
     */
    where: CampaignLogWhereUniqueInput
  }

  /**
   * CampaignLog deleteMany
   */
  export type CampaignLogDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CampaignLogs to delete
     */
    where?: CampaignLogWhereInput
    /**
     * Limit how many CampaignLogs to delete.
     */
    limit?: number
  }

  /**
   * CampaignLog without action
   */
  export type CampaignLogDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CampaignLog
     */
    select?: CampaignLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CampaignLog
     */
    omit?: CampaignLogOmit<ExtArgs> | null
  }


  /**
   * Model CaptureOrder
   */

  export type AggregateCaptureOrder = {
    _count: CaptureOrderCountAggregateOutputType | null
    _avg: CaptureOrderAvgAggregateOutputType | null
    _sum: CaptureOrderSumAggregateOutputType | null
    _min: CaptureOrderMinAggregateOutputType | null
    _max: CaptureOrderMaxAggregateOutputType | null
  }

  export type CaptureOrderAvgAggregateOutputType = {
    quantity: number | null
    balanceDue: number | null
  }

  export type CaptureOrderSumAggregateOutputType = {
    quantity: number | null
    balanceDue: number | null
  }

  export type CaptureOrderMinAggregateOutputType = {
    id: string | null
    customerName: string | null
    quantity: number | null
    product: string | null
    printType: string | null
    dueDate: string | null
    status: string | null
    paymentStatus: string | null
    depositRequired: boolean | null
    depositReceived: boolean | null
    balanceDue: number | null
    paymentNotes: string | null
    createdAt: Date | null
  }

  export type CaptureOrderMaxAggregateOutputType = {
    id: string | null
    customerName: string | null
    quantity: number | null
    product: string | null
    printType: string | null
    dueDate: string | null
    status: string | null
    paymentStatus: string | null
    depositRequired: boolean | null
    depositReceived: boolean | null
    balanceDue: number | null
    paymentNotes: string | null
    createdAt: Date | null
  }

  export type CaptureOrderCountAggregateOutputType = {
    id: number
    customerName: number
    quantity: number
    product: number
    printType: number
    dueDate: number
    status: number
    paymentStatus: number
    depositRequired: number
    depositReceived: number
    balanceDue: number
    paymentNotes: number
    createdAt: number
    _all: number
  }


  export type CaptureOrderAvgAggregateInputType = {
    quantity?: true
    balanceDue?: true
  }

  export type CaptureOrderSumAggregateInputType = {
    quantity?: true
    balanceDue?: true
  }

  export type CaptureOrderMinAggregateInputType = {
    id?: true
    customerName?: true
    quantity?: true
    product?: true
    printType?: true
    dueDate?: true
    status?: true
    paymentStatus?: true
    depositRequired?: true
    depositReceived?: true
    balanceDue?: true
    paymentNotes?: true
    createdAt?: true
  }

  export type CaptureOrderMaxAggregateInputType = {
    id?: true
    customerName?: true
    quantity?: true
    product?: true
    printType?: true
    dueDate?: true
    status?: true
    paymentStatus?: true
    depositRequired?: true
    depositReceived?: true
    balanceDue?: true
    paymentNotes?: true
    createdAt?: true
  }

  export type CaptureOrderCountAggregateInputType = {
    id?: true
    customerName?: true
    quantity?: true
    product?: true
    printType?: true
    dueDate?: true
    status?: true
    paymentStatus?: true
    depositRequired?: true
    depositReceived?: true
    balanceDue?: true
    paymentNotes?: true
    createdAt?: true
    _all?: true
  }

  export type CaptureOrderAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CaptureOrder to aggregate.
     */
    where?: CaptureOrderWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CaptureOrders to fetch.
     */
    orderBy?: CaptureOrderOrderByWithRelationInput | CaptureOrderOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CaptureOrderWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CaptureOrders from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CaptureOrders.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned CaptureOrders
    **/
    _count?: true | CaptureOrderCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: CaptureOrderAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: CaptureOrderSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CaptureOrderMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CaptureOrderMaxAggregateInputType
  }

  export type GetCaptureOrderAggregateType<T extends CaptureOrderAggregateArgs> = {
        [P in keyof T & keyof AggregateCaptureOrder]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCaptureOrder[P]>
      : GetScalarType<T[P], AggregateCaptureOrder[P]>
  }




  export type CaptureOrderGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CaptureOrderWhereInput
    orderBy?: CaptureOrderOrderByWithAggregationInput | CaptureOrderOrderByWithAggregationInput[]
    by: CaptureOrderScalarFieldEnum[] | CaptureOrderScalarFieldEnum
    having?: CaptureOrderScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CaptureOrderCountAggregateInputType | true
    _avg?: CaptureOrderAvgAggregateInputType
    _sum?: CaptureOrderSumAggregateInputType
    _min?: CaptureOrderMinAggregateInputType
    _max?: CaptureOrderMaxAggregateInputType
  }

  export type CaptureOrderGroupByOutputType = {
    id: string
    customerName: string
    quantity: number
    product: string
    printType: string
    dueDate: string
    status: string
    paymentStatus: string
    depositRequired: boolean
    depositReceived: boolean
    balanceDue: number
    paymentNotes: string
    createdAt: Date
    _count: CaptureOrderCountAggregateOutputType | null
    _avg: CaptureOrderAvgAggregateOutputType | null
    _sum: CaptureOrderSumAggregateOutputType | null
    _min: CaptureOrderMinAggregateOutputType | null
    _max: CaptureOrderMaxAggregateOutputType | null
  }

  type GetCaptureOrderGroupByPayload<T extends CaptureOrderGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CaptureOrderGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CaptureOrderGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CaptureOrderGroupByOutputType[P]>
            : GetScalarType<T[P], CaptureOrderGroupByOutputType[P]>
        }
      >
    >


  export type CaptureOrderSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    customerName?: boolean
    quantity?: boolean
    product?: boolean
    printType?: boolean
    dueDate?: boolean
    status?: boolean
    paymentStatus?: boolean
    depositRequired?: boolean
    depositReceived?: boolean
    balanceDue?: boolean
    paymentNotes?: boolean
    createdAt?: boolean
    tasks?: boolean | CaptureOrder$tasksArgs<ExtArgs>
    _count?: boolean | CaptureOrderCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["captureOrder"]>

  export type CaptureOrderSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    customerName?: boolean
    quantity?: boolean
    product?: boolean
    printType?: boolean
    dueDate?: boolean
    status?: boolean
    paymentStatus?: boolean
    depositRequired?: boolean
    depositReceived?: boolean
    balanceDue?: boolean
    paymentNotes?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["captureOrder"]>

  export type CaptureOrderSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    customerName?: boolean
    quantity?: boolean
    product?: boolean
    printType?: boolean
    dueDate?: boolean
    status?: boolean
    paymentStatus?: boolean
    depositRequired?: boolean
    depositReceived?: boolean
    balanceDue?: boolean
    paymentNotes?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["captureOrder"]>

  export type CaptureOrderSelectScalar = {
    id?: boolean
    customerName?: boolean
    quantity?: boolean
    product?: boolean
    printType?: boolean
    dueDate?: boolean
    status?: boolean
    paymentStatus?: boolean
    depositRequired?: boolean
    depositReceived?: boolean
    balanceDue?: boolean
    paymentNotes?: boolean
    createdAt?: boolean
  }

  export type CaptureOrderOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "customerName" | "quantity" | "product" | "printType" | "dueDate" | "status" | "paymentStatus" | "depositRequired" | "depositReceived" | "balanceDue" | "paymentNotes" | "createdAt", ExtArgs["result"]["captureOrder"]>
  export type CaptureOrderInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tasks?: boolean | CaptureOrder$tasksArgs<ExtArgs>
    _count?: boolean | CaptureOrderCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type CaptureOrderIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type CaptureOrderIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $CaptureOrderPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "CaptureOrder"
    objects: {
      tasks: Prisma.$CaptureTaskPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      customerName: string
      quantity: number
      product: string
      printType: string
      dueDate: string
      status: string
      paymentStatus: string
      depositRequired: boolean
      depositReceived: boolean
      balanceDue: number
      paymentNotes: string
      createdAt: Date
    }, ExtArgs["result"]["captureOrder"]>
    composites: {}
  }

  type CaptureOrderGetPayload<S extends boolean | null | undefined | CaptureOrderDefaultArgs> = $Result.GetResult<Prisma.$CaptureOrderPayload, S>

  type CaptureOrderCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<CaptureOrderFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: CaptureOrderCountAggregateInputType | true
    }

  export interface CaptureOrderDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['CaptureOrder'], meta: { name: 'CaptureOrder' } }
    /**
     * Find zero or one CaptureOrder that matches the filter.
     * @param {CaptureOrderFindUniqueArgs} args - Arguments to find a CaptureOrder
     * @example
     * // Get one CaptureOrder
     * const captureOrder = await prisma.captureOrder.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CaptureOrderFindUniqueArgs>(args: SelectSubset<T, CaptureOrderFindUniqueArgs<ExtArgs>>): Prisma__CaptureOrderClient<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one CaptureOrder that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {CaptureOrderFindUniqueOrThrowArgs} args - Arguments to find a CaptureOrder
     * @example
     * // Get one CaptureOrder
     * const captureOrder = await prisma.captureOrder.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CaptureOrderFindUniqueOrThrowArgs>(args: SelectSubset<T, CaptureOrderFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CaptureOrderClient<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first CaptureOrder that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureOrderFindFirstArgs} args - Arguments to find a CaptureOrder
     * @example
     * // Get one CaptureOrder
     * const captureOrder = await prisma.captureOrder.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CaptureOrderFindFirstArgs>(args?: SelectSubset<T, CaptureOrderFindFirstArgs<ExtArgs>>): Prisma__CaptureOrderClient<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first CaptureOrder that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureOrderFindFirstOrThrowArgs} args - Arguments to find a CaptureOrder
     * @example
     * // Get one CaptureOrder
     * const captureOrder = await prisma.captureOrder.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CaptureOrderFindFirstOrThrowArgs>(args?: SelectSubset<T, CaptureOrderFindFirstOrThrowArgs<ExtArgs>>): Prisma__CaptureOrderClient<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more CaptureOrders that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureOrderFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all CaptureOrders
     * const captureOrders = await prisma.captureOrder.findMany()
     * 
     * // Get first 10 CaptureOrders
     * const captureOrders = await prisma.captureOrder.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const captureOrderWithIdOnly = await prisma.captureOrder.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CaptureOrderFindManyArgs>(args?: SelectSubset<T, CaptureOrderFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a CaptureOrder.
     * @param {CaptureOrderCreateArgs} args - Arguments to create a CaptureOrder.
     * @example
     * // Create one CaptureOrder
     * const CaptureOrder = await prisma.captureOrder.create({
     *   data: {
     *     // ... data to create a CaptureOrder
     *   }
     * })
     * 
     */
    create<T extends CaptureOrderCreateArgs>(args: SelectSubset<T, CaptureOrderCreateArgs<ExtArgs>>): Prisma__CaptureOrderClient<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many CaptureOrders.
     * @param {CaptureOrderCreateManyArgs} args - Arguments to create many CaptureOrders.
     * @example
     * // Create many CaptureOrders
     * const captureOrder = await prisma.captureOrder.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CaptureOrderCreateManyArgs>(args?: SelectSubset<T, CaptureOrderCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many CaptureOrders and returns the data saved in the database.
     * @param {CaptureOrderCreateManyAndReturnArgs} args - Arguments to create many CaptureOrders.
     * @example
     * // Create many CaptureOrders
     * const captureOrder = await prisma.captureOrder.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many CaptureOrders and only return the `id`
     * const captureOrderWithIdOnly = await prisma.captureOrder.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CaptureOrderCreateManyAndReturnArgs>(args?: SelectSubset<T, CaptureOrderCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a CaptureOrder.
     * @param {CaptureOrderDeleteArgs} args - Arguments to delete one CaptureOrder.
     * @example
     * // Delete one CaptureOrder
     * const CaptureOrder = await prisma.captureOrder.delete({
     *   where: {
     *     // ... filter to delete one CaptureOrder
     *   }
     * })
     * 
     */
    delete<T extends CaptureOrderDeleteArgs>(args: SelectSubset<T, CaptureOrderDeleteArgs<ExtArgs>>): Prisma__CaptureOrderClient<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one CaptureOrder.
     * @param {CaptureOrderUpdateArgs} args - Arguments to update one CaptureOrder.
     * @example
     * // Update one CaptureOrder
     * const captureOrder = await prisma.captureOrder.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CaptureOrderUpdateArgs>(args: SelectSubset<T, CaptureOrderUpdateArgs<ExtArgs>>): Prisma__CaptureOrderClient<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more CaptureOrders.
     * @param {CaptureOrderDeleteManyArgs} args - Arguments to filter CaptureOrders to delete.
     * @example
     * // Delete a few CaptureOrders
     * const { count } = await prisma.captureOrder.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CaptureOrderDeleteManyArgs>(args?: SelectSubset<T, CaptureOrderDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CaptureOrders.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureOrderUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many CaptureOrders
     * const captureOrder = await prisma.captureOrder.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CaptureOrderUpdateManyArgs>(args: SelectSubset<T, CaptureOrderUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CaptureOrders and returns the data updated in the database.
     * @param {CaptureOrderUpdateManyAndReturnArgs} args - Arguments to update many CaptureOrders.
     * @example
     * // Update many CaptureOrders
     * const captureOrder = await prisma.captureOrder.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more CaptureOrders and only return the `id`
     * const captureOrderWithIdOnly = await prisma.captureOrder.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends CaptureOrderUpdateManyAndReturnArgs>(args: SelectSubset<T, CaptureOrderUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one CaptureOrder.
     * @param {CaptureOrderUpsertArgs} args - Arguments to update or create a CaptureOrder.
     * @example
     * // Update or create a CaptureOrder
     * const captureOrder = await prisma.captureOrder.upsert({
     *   create: {
     *     // ... data to create a CaptureOrder
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the CaptureOrder we want to update
     *   }
     * })
     */
    upsert<T extends CaptureOrderUpsertArgs>(args: SelectSubset<T, CaptureOrderUpsertArgs<ExtArgs>>): Prisma__CaptureOrderClient<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of CaptureOrders.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureOrderCountArgs} args - Arguments to filter CaptureOrders to count.
     * @example
     * // Count the number of CaptureOrders
     * const count = await prisma.captureOrder.count({
     *   where: {
     *     // ... the filter for the CaptureOrders we want to count
     *   }
     * })
    **/
    count<T extends CaptureOrderCountArgs>(
      args?: Subset<T, CaptureOrderCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CaptureOrderCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a CaptureOrder.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureOrderAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CaptureOrderAggregateArgs>(args: Subset<T, CaptureOrderAggregateArgs>): Prisma.PrismaPromise<GetCaptureOrderAggregateType<T>>

    /**
     * Group by CaptureOrder.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureOrderGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CaptureOrderGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CaptureOrderGroupByArgs['orderBy'] }
        : { orderBy?: CaptureOrderGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CaptureOrderGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCaptureOrderGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the CaptureOrder model
   */
  readonly fields: CaptureOrderFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for CaptureOrder.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CaptureOrderClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    tasks<T extends CaptureOrder$tasksArgs<ExtArgs> = {}>(args?: Subset<T, CaptureOrder$tasksArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "findMany", ClientOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the CaptureOrder model
   */ 
  interface CaptureOrderFieldRefs {
    readonly id: FieldRef<"CaptureOrder", 'String'>
    readonly customerName: FieldRef<"CaptureOrder", 'String'>
    readonly quantity: FieldRef<"CaptureOrder", 'Int'>
    readonly product: FieldRef<"CaptureOrder", 'String'>
    readonly printType: FieldRef<"CaptureOrder", 'String'>
    readonly dueDate: FieldRef<"CaptureOrder", 'String'>
    readonly status: FieldRef<"CaptureOrder", 'String'>
    readonly paymentStatus: FieldRef<"CaptureOrder", 'String'>
    readonly depositRequired: FieldRef<"CaptureOrder", 'Boolean'>
    readonly depositReceived: FieldRef<"CaptureOrder", 'Boolean'>
    readonly balanceDue: FieldRef<"CaptureOrder", 'Float'>
    readonly paymentNotes: FieldRef<"CaptureOrder", 'String'>
    readonly createdAt: FieldRef<"CaptureOrder", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * CaptureOrder findUnique
   */
  export type CaptureOrderFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureOrderInclude<ExtArgs> | null
    /**
     * Filter, which CaptureOrder to fetch.
     */
    where: CaptureOrderWhereUniqueInput
  }

  /**
   * CaptureOrder findUniqueOrThrow
   */
  export type CaptureOrderFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureOrderInclude<ExtArgs> | null
    /**
     * Filter, which CaptureOrder to fetch.
     */
    where: CaptureOrderWhereUniqueInput
  }

  /**
   * CaptureOrder findFirst
   */
  export type CaptureOrderFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureOrderInclude<ExtArgs> | null
    /**
     * Filter, which CaptureOrder to fetch.
     */
    where?: CaptureOrderWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CaptureOrders to fetch.
     */
    orderBy?: CaptureOrderOrderByWithRelationInput | CaptureOrderOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CaptureOrders.
     */
    cursor?: CaptureOrderWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CaptureOrders from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CaptureOrders.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CaptureOrders.
     */
    distinct?: CaptureOrderScalarFieldEnum | CaptureOrderScalarFieldEnum[]
  }

  /**
   * CaptureOrder findFirstOrThrow
   */
  export type CaptureOrderFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureOrderInclude<ExtArgs> | null
    /**
     * Filter, which CaptureOrder to fetch.
     */
    where?: CaptureOrderWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CaptureOrders to fetch.
     */
    orderBy?: CaptureOrderOrderByWithRelationInput | CaptureOrderOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CaptureOrders.
     */
    cursor?: CaptureOrderWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CaptureOrders from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CaptureOrders.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CaptureOrders.
     */
    distinct?: CaptureOrderScalarFieldEnum | CaptureOrderScalarFieldEnum[]
  }

  /**
   * CaptureOrder findMany
   */
  export type CaptureOrderFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureOrderInclude<ExtArgs> | null
    /**
     * Filter, which CaptureOrders to fetch.
     */
    where?: CaptureOrderWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CaptureOrders to fetch.
     */
    orderBy?: CaptureOrderOrderByWithRelationInput | CaptureOrderOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing CaptureOrders.
     */
    cursor?: CaptureOrderWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CaptureOrders from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CaptureOrders.
     */
    skip?: number
    distinct?: CaptureOrderScalarFieldEnum | CaptureOrderScalarFieldEnum[]
  }

  /**
   * CaptureOrder create
   */
  export type CaptureOrderCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureOrderInclude<ExtArgs> | null
    /**
     * The data needed to create a CaptureOrder.
     */
    data: XOR<CaptureOrderCreateInput, CaptureOrderUncheckedCreateInput>
  }

  /**
   * CaptureOrder createMany
   */
  export type CaptureOrderCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many CaptureOrders.
     */
    data: CaptureOrderCreateManyInput | CaptureOrderCreateManyInput[]
  }

  /**
   * CaptureOrder createManyAndReturn
   */
  export type CaptureOrderCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * The data used to create many CaptureOrders.
     */
    data: CaptureOrderCreateManyInput | CaptureOrderCreateManyInput[]
  }

  /**
   * CaptureOrder update
   */
  export type CaptureOrderUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureOrderInclude<ExtArgs> | null
    /**
     * The data needed to update a CaptureOrder.
     */
    data: XOR<CaptureOrderUpdateInput, CaptureOrderUncheckedUpdateInput>
    /**
     * Choose, which CaptureOrder to update.
     */
    where: CaptureOrderWhereUniqueInput
  }

  /**
   * CaptureOrder updateMany
   */
  export type CaptureOrderUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update CaptureOrders.
     */
    data: XOR<CaptureOrderUpdateManyMutationInput, CaptureOrderUncheckedUpdateManyInput>
    /**
     * Filter which CaptureOrders to update
     */
    where?: CaptureOrderWhereInput
    /**
     * Limit how many CaptureOrders to update.
     */
    limit?: number
  }

  /**
   * CaptureOrder updateManyAndReturn
   */
  export type CaptureOrderUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * The data used to update CaptureOrders.
     */
    data: XOR<CaptureOrderUpdateManyMutationInput, CaptureOrderUncheckedUpdateManyInput>
    /**
     * Filter which CaptureOrders to update
     */
    where?: CaptureOrderWhereInput
    /**
     * Limit how many CaptureOrders to update.
     */
    limit?: number
  }

  /**
   * CaptureOrder upsert
   */
  export type CaptureOrderUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureOrderInclude<ExtArgs> | null
    /**
     * The filter to search for the CaptureOrder to update in case it exists.
     */
    where: CaptureOrderWhereUniqueInput
    /**
     * In case the CaptureOrder found by the `where` argument doesn't exist, create a new CaptureOrder with this data.
     */
    create: XOR<CaptureOrderCreateInput, CaptureOrderUncheckedCreateInput>
    /**
     * In case the CaptureOrder was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CaptureOrderUpdateInput, CaptureOrderUncheckedUpdateInput>
  }

  /**
   * CaptureOrder delete
   */
  export type CaptureOrderDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureOrderInclude<ExtArgs> | null
    /**
     * Filter which CaptureOrder to delete.
     */
    where: CaptureOrderWhereUniqueInput
  }

  /**
   * CaptureOrder deleteMany
   */
  export type CaptureOrderDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CaptureOrders to delete
     */
    where?: CaptureOrderWhereInput
    /**
     * Limit how many CaptureOrders to delete.
     */
    limit?: number
  }

  /**
   * CaptureOrder.tasks
   */
  export type CaptureOrder$tasksArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
    where?: CaptureTaskWhereInput
    orderBy?: CaptureTaskOrderByWithRelationInput | CaptureTaskOrderByWithRelationInput[]
    cursor?: CaptureTaskWhereUniqueInput
    take?: number
    skip?: number
    distinct?: CaptureTaskScalarFieldEnum | CaptureTaskScalarFieldEnum[]
  }

  /**
   * CaptureOrder without action
   */
  export type CaptureOrderDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureOrder
     */
    select?: CaptureOrderSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureOrder
     */
    omit?: CaptureOrderOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureOrderInclude<ExtArgs> | null
  }


  /**
   * Model CaptureTask
   */

  export type AggregateCaptureTask = {
    _count: CaptureTaskCountAggregateOutputType | null
    _min: CaptureTaskMinAggregateOutputType | null
    _max: CaptureTaskMaxAggregateOutputType | null
  }

  export type CaptureTaskMinAggregateOutputType = {
    id: string | null
    orderId: string | null
    title: string | null
    status: string | null
    createdAt: Date | null
  }

  export type CaptureTaskMaxAggregateOutputType = {
    id: string | null
    orderId: string | null
    title: string | null
    status: string | null
    createdAt: Date | null
  }

  export type CaptureTaskCountAggregateOutputType = {
    id: number
    orderId: number
    title: number
    status: number
    createdAt: number
    _all: number
  }


  export type CaptureTaskMinAggregateInputType = {
    id?: true
    orderId?: true
    title?: true
    status?: true
    createdAt?: true
  }

  export type CaptureTaskMaxAggregateInputType = {
    id?: true
    orderId?: true
    title?: true
    status?: true
    createdAt?: true
  }

  export type CaptureTaskCountAggregateInputType = {
    id?: true
    orderId?: true
    title?: true
    status?: true
    createdAt?: true
    _all?: true
  }

  export type CaptureTaskAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CaptureTask to aggregate.
     */
    where?: CaptureTaskWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CaptureTasks to fetch.
     */
    orderBy?: CaptureTaskOrderByWithRelationInput | CaptureTaskOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CaptureTaskWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CaptureTasks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CaptureTasks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned CaptureTasks
    **/
    _count?: true | CaptureTaskCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CaptureTaskMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CaptureTaskMaxAggregateInputType
  }

  export type GetCaptureTaskAggregateType<T extends CaptureTaskAggregateArgs> = {
        [P in keyof T & keyof AggregateCaptureTask]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCaptureTask[P]>
      : GetScalarType<T[P], AggregateCaptureTask[P]>
  }




  export type CaptureTaskGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CaptureTaskWhereInput
    orderBy?: CaptureTaskOrderByWithAggregationInput | CaptureTaskOrderByWithAggregationInput[]
    by: CaptureTaskScalarFieldEnum[] | CaptureTaskScalarFieldEnum
    having?: CaptureTaskScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CaptureTaskCountAggregateInputType | true
    _min?: CaptureTaskMinAggregateInputType
    _max?: CaptureTaskMaxAggregateInputType
  }

  export type CaptureTaskGroupByOutputType = {
    id: string
    orderId: string
    title: string
    status: string
    createdAt: Date
    _count: CaptureTaskCountAggregateOutputType | null
    _min: CaptureTaskMinAggregateOutputType | null
    _max: CaptureTaskMaxAggregateOutputType | null
  }

  type GetCaptureTaskGroupByPayload<T extends CaptureTaskGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CaptureTaskGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CaptureTaskGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CaptureTaskGroupByOutputType[P]>
            : GetScalarType<T[P], CaptureTaskGroupByOutputType[P]>
        }
      >
    >


  export type CaptureTaskSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    orderId?: boolean
    title?: boolean
    status?: boolean
    createdAt?: boolean
    order?: boolean | CaptureOrderDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["captureTask"]>

  export type CaptureTaskSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    orderId?: boolean
    title?: boolean
    status?: boolean
    createdAt?: boolean
    order?: boolean | CaptureOrderDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["captureTask"]>

  export type CaptureTaskSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    orderId?: boolean
    title?: boolean
    status?: boolean
    createdAt?: boolean
    order?: boolean | CaptureOrderDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["captureTask"]>

  export type CaptureTaskSelectScalar = {
    id?: boolean
    orderId?: boolean
    title?: boolean
    status?: boolean
    createdAt?: boolean
  }

  export type CaptureTaskOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "orderId" | "title" | "status" | "createdAt", ExtArgs["result"]["captureTask"]>
  export type CaptureTaskInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    order?: boolean | CaptureOrderDefaultArgs<ExtArgs>
  }
  export type CaptureTaskIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    order?: boolean | CaptureOrderDefaultArgs<ExtArgs>
  }
  export type CaptureTaskIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    order?: boolean | CaptureOrderDefaultArgs<ExtArgs>
  }

  export type $CaptureTaskPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "CaptureTask"
    objects: {
      order: Prisma.$CaptureOrderPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      orderId: string
      title: string
      status: string
      createdAt: Date
    }, ExtArgs["result"]["captureTask"]>
    composites: {}
  }

  type CaptureTaskGetPayload<S extends boolean | null | undefined | CaptureTaskDefaultArgs> = $Result.GetResult<Prisma.$CaptureTaskPayload, S>

  type CaptureTaskCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<CaptureTaskFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: CaptureTaskCountAggregateInputType | true
    }

  export interface CaptureTaskDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['CaptureTask'], meta: { name: 'CaptureTask' } }
    /**
     * Find zero or one CaptureTask that matches the filter.
     * @param {CaptureTaskFindUniqueArgs} args - Arguments to find a CaptureTask
     * @example
     * // Get one CaptureTask
     * const captureTask = await prisma.captureTask.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CaptureTaskFindUniqueArgs>(args: SelectSubset<T, CaptureTaskFindUniqueArgs<ExtArgs>>): Prisma__CaptureTaskClient<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "findUnique", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find one CaptureTask that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {CaptureTaskFindUniqueOrThrowArgs} args - Arguments to find a CaptureTask
     * @example
     * // Get one CaptureTask
     * const captureTask = await prisma.captureTask.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CaptureTaskFindUniqueOrThrowArgs>(args: SelectSubset<T, CaptureTaskFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CaptureTaskClient<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find the first CaptureTask that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureTaskFindFirstArgs} args - Arguments to find a CaptureTask
     * @example
     * // Get one CaptureTask
     * const captureTask = await prisma.captureTask.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CaptureTaskFindFirstArgs>(args?: SelectSubset<T, CaptureTaskFindFirstArgs<ExtArgs>>): Prisma__CaptureTaskClient<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "findFirst", ClientOptions> | null, null, ExtArgs, ClientOptions>

    /**
     * Find the first CaptureTask that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureTaskFindFirstOrThrowArgs} args - Arguments to find a CaptureTask
     * @example
     * // Get one CaptureTask
     * const captureTask = await prisma.captureTask.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CaptureTaskFindFirstOrThrowArgs>(args?: SelectSubset<T, CaptureTaskFindFirstOrThrowArgs<ExtArgs>>): Prisma__CaptureTaskClient<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "findFirstOrThrow", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Find zero or more CaptureTasks that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureTaskFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all CaptureTasks
     * const captureTasks = await prisma.captureTask.findMany()
     * 
     * // Get first 10 CaptureTasks
     * const captureTasks = await prisma.captureTask.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const captureTaskWithIdOnly = await prisma.captureTask.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CaptureTaskFindManyArgs>(args?: SelectSubset<T, CaptureTaskFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "findMany", ClientOptions>>

    /**
     * Create a CaptureTask.
     * @param {CaptureTaskCreateArgs} args - Arguments to create a CaptureTask.
     * @example
     * // Create one CaptureTask
     * const CaptureTask = await prisma.captureTask.create({
     *   data: {
     *     // ... data to create a CaptureTask
     *   }
     * })
     * 
     */
    create<T extends CaptureTaskCreateArgs>(args: SelectSubset<T, CaptureTaskCreateArgs<ExtArgs>>): Prisma__CaptureTaskClient<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "create", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Create many CaptureTasks.
     * @param {CaptureTaskCreateManyArgs} args - Arguments to create many CaptureTasks.
     * @example
     * // Create many CaptureTasks
     * const captureTask = await prisma.captureTask.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CaptureTaskCreateManyArgs>(args?: SelectSubset<T, CaptureTaskCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many CaptureTasks and returns the data saved in the database.
     * @param {CaptureTaskCreateManyAndReturnArgs} args - Arguments to create many CaptureTasks.
     * @example
     * // Create many CaptureTasks
     * const captureTask = await prisma.captureTask.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many CaptureTasks and only return the `id`
     * const captureTaskWithIdOnly = await prisma.captureTask.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CaptureTaskCreateManyAndReturnArgs>(args?: SelectSubset<T, CaptureTaskCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "createManyAndReturn", ClientOptions>>

    /**
     * Delete a CaptureTask.
     * @param {CaptureTaskDeleteArgs} args - Arguments to delete one CaptureTask.
     * @example
     * // Delete one CaptureTask
     * const CaptureTask = await prisma.captureTask.delete({
     *   where: {
     *     // ... filter to delete one CaptureTask
     *   }
     * })
     * 
     */
    delete<T extends CaptureTaskDeleteArgs>(args: SelectSubset<T, CaptureTaskDeleteArgs<ExtArgs>>): Prisma__CaptureTaskClient<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "delete", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Update one CaptureTask.
     * @param {CaptureTaskUpdateArgs} args - Arguments to update one CaptureTask.
     * @example
     * // Update one CaptureTask
     * const captureTask = await prisma.captureTask.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CaptureTaskUpdateArgs>(args: SelectSubset<T, CaptureTaskUpdateArgs<ExtArgs>>): Prisma__CaptureTaskClient<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "update", ClientOptions>, never, ExtArgs, ClientOptions>

    /**
     * Delete zero or more CaptureTasks.
     * @param {CaptureTaskDeleteManyArgs} args - Arguments to filter CaptureTasks to delete.
     * @example
     * // Delete a few CaptureTasks
     * const { count } = await prisma.captureTask.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CaptureTaskDeleteManyArgs>(args?: SelectSubset<T, CaptureTaskDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CaptureTasks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureTaskUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many CaptureTasks
     * const captureTask = await prisma.captureTask.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CaptureTaskUpdateManyArgs>(args: SelectSubset<T, CaptureTaskUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CaptureTasks and returns the data updated in the database.
     * @param {CaptureTaskUpdateManyAndReturnArgs} args - Arguments to update many CaptureTasks.
     * @example
     * // Update many CaptureTasks
     * const captureTask = await prisma.captureTask.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more CaptureTasks and only return the `id`
     * const captureTaskWithIdOnly = await prisma.captureTask.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends CaptureTaskUpdateManyAndReturnArgs>(args: SelectSubset<T, CaptureTaskUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "updateManyAndReturn", ClientOptions>>

    /**
     * Create or update one CaptureTask.
     * @param {CaptureTaskUpsertArgs} args - Arguments to update or create a CaptureTask.
     * @example
     * // Update or create a CaptureTask
     * const captureTask = await prisma.captureTask.upsert({
     *   create: {
     *     // ... data to create a CaptureTask
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the CaptureTask we want to update
     *   }
     * })
     */
    upsert<T extends CaptureTaskUpsertArgs>(args: SelectSubset<T, CaptureTaskUpsertArgs<ExtArgs>>): Prisma__CaptureTaskClient<$Result.GetResult<Prisma.$CaptureTaskPayload<ExtArgs>, T, "upsert", ClientOptions>, never, ExtArgs, ClientOptions>


    /**
     * Count the number of CaptureTasks.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureTaskCountArgs} args - Arguments to filter CaptureTasks to count.
     * @example
     * // Count the number of CaptureTasks
     * const count = await prisma.captureTask.count({
     *   where: {
     *     // ... the filter for the CaptureTasks we want to count
     *   }
     * })
    **/
    count<T extends CaptureTaskCountArgs>(
      args?: Subset<T, CaptureTaskCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CaptureTaskCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a CaptureTask.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureTaskAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CaptureTaskAggregateArgs>(args: Subset<T, CaptureTaskAggregateArgs>): Prisma.PrismaPromise<GetCaptureTaskAggregateType<T>>

    /**
     * Group by CaptureTask.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CaptureTaskGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CaptureTaskGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CaptureTaskGroupByArgs['orderBy'] }
        : { orderBy?: CaptureTaskGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CaptureTaskGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCaptureTaskGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the CaptureTask model
   */
  readonly fields: CaptureTaskFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for CaptureTask.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CaptureTaskClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    order<T extends CaptureOrderDefaultArgs<ExtArgs> = {}>(args?: Subset<T, CaptureOrderDefaultArgs<ExtArgs>>): Prisma__CaptureOrderClient<$Result.GetResult<Prisma.$CaptureOrderPayload<ExtArgs>, T, "findUniqueOrThrow", ClientOptions> | Null, Null, ExtArgs, ClientOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the CaptureTask model
   */ 
  interface CaptureTaskFieldRefs {
    readonly id: FieldRef<"CaptureTask", 'String'>
    readonly orderId: FieldRef<"CaptureTask", 'String'>
    readonly title: FieldRef<"CaptureTask", 'String'>
    readonly status: FieldRef<"CaptureTask", 'String'>
    readonly createdAt: FieldRef<"CaptureTask", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * CaptureTask findUnique
   */
  export type CaptureTaskFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
    /**
     * Filter, which CaptureTask to fetch.
     */
    where: CaptureTaskWhereUniqueInput
  }

  /**
   * CaptureTask findUniqueOrThrow
   */
  export type CaptureTaskFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
    /**
     * Filter, which CaptureTask to fetch.
     */
    where: CaptureTaskWhereUniqueInput
  }

  /**
   * CaptureTask findFirst
   */
  export type CaptureTaskFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
    /**
     * Filter, which CaptureTask to fetch.
     */
    where?: CaptureTaskWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CaptureTasks to fetch.
     */
    orderBy?: CaptureTaskOrderByWithRelationInput | CaptureTaskOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CaptureTasks.
     */
    cursor?: CaptureTaskWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CaptureTasks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CaptureTasks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CaptureTasks.
     */
    distinct?: CaptureTaskScalarFieldEnum | CaptureTaskScalarFieldEnum[]
  }

  /**
   * CaptureTask findFirstOrThrow
   */
  export type CaptureTaskFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
    /**
     * Filter, which CaptureTask to fetch.
     */
    where?: CaptureTaskWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CaptureTasks to fetch.
     */
    orderBy?: CaptureTaskOrderByWithRelationInput | CaptureTaskOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CaptureTasks.
     */
    cursor?: CaptureTaskWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CaptureTasks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CaptureTasks.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CaptureTasks.
     */
    distinct?: CaptureTaskScalarFieldEnum | CaptureTaskScalarFieldEnum[]
  }

  /**
   * CaptureTask findMany
   */
  export type CaptureTaskFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
    /**
     * Filter, which CaptureTasks to fetch.
     */
    where?: CaptureTaskWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CaptureTasks to fetch.
     */
    orderBy?: CaptureTaskOrderByWithRelationInput | CaptureTaskOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing CaptureTasks.
     */
    cursor?: CaptureTaskWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CaptureTasks from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CaptureTasks.
     */
    skip?: number
    distinct?: CaptureTaskScalarFieldEnum | CaptureTaskScalarFieldEnum[]
  }

  /**
   * CaptureTask create
   */
  export type CaptureTaskCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
    /**
     * The data needed to create a CaptureTask.
     */
    data: XOR<CaptureTaskCreateInput, CaptureTaskUncheckedCreateInput>
  }

  /**
   * CaptureTask createMany
   */
  export type CaptureTaskCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many CaptureTasks.
     */
    data: CaptureTaskCreateManyInput | CaptureTaskCreateManyInput[]
  }

  /**
   * CaptureTask createManyAndReturn
   */
  export type CaptureTaskCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * The data used to create many CaptureTasks.
     */
    data: CaptureTaskCreateManyInput | CaptureTaskCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * CaptureTask update
   */
  export type CaptureTaskUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
    /**
     * The data needed to update a CaptureTask.
     */
    data: XOR<CaptureTaskUpdateInput, CaptureTaskUncheckedUpdateInput>
    /**
     * Choose, which CaptureTask to update.
     */
    where: CaptureTaskWhereUniqueInput
  }

  /**
   * CaptureTask updateMany
   */
  export type CaptureTaskUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update CaptureTasks.
     */
    data: XOR<CaptureTaskUpdateManyMutationInput, CaptureTaskUncheckedUpdateManyInput>
    /**
     * Filter which CaptureTasks to update
     */
    where?: CaptureTaskWhereInput
    /**
     * Limit how many CaptureTasks to update.
     */
    limit?: number
  }

  /**
   * CaptureTask updateManyAndReturn
   */
  export type CaptureTaskUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * The data used to update CaptureTasks.
     */
    data: XOR<CaptureTaskUpdateManyMutationInput, CaptureTaskUncheckedUpdateManyInput>
    /**
     * Filter which CaptureTasks to update
     */
    where?: CaptureTaskWhereInput
    /**
     * Limit how many CaptureTasks to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * CaptureTask upsert
   */
  export type CaptureTaskUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
    /**
     * The filter to search for the CaptureTask to update in case it exists.
     */
    where: CaptureTaskWhereUniqueInput
    /**
     * In case the CaptureTask found by the `where` argument doesn't exist, create a new CaptureTask with this data.
     */
    create: XOR<CaptureTaskCreateInput, CaptureTaskUncheckedCreateInput>
    /**
     * In case the CaptureTask was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CaptureTaskUpdateInput, CaptureTaskUncheckedUpdateInput>
  }

  /**
   * CaptureTask delete
   */
  export type CaptureTaskDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
    /**
     * Filter which CaptureTask to delete.
     */
    where: CaptureTaskWhereUniqueInput
  }

  /**
   * CaptureTask deleteMany
   */
  export type CaptureTaskDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CaptureTasks to delete
     */
    where?: CaptureTaskWhereInput
    /**
     * Limit how many CaptureTasks to delete.
     */
    limit?: number
  }

  /**
   * CaptureTask without action
   */
  export type CaptureTaskDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CaptureTask
     */
    select?: CaptureTaskSelect<ExtArgs> | null
    /**
     * Omit specific fields from the CaptureTask
     */
    omit?: CaptureTaskOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CaptureTaskInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const CustomerScalarFieldEnum: {
    id: 'id',
    squareCustomerId: 'squareCustomerId',
    name: 'name',
    email: 'email',
    phone: 'phone',
    lastOrderDate: 'lastOrderDate',
    totalSpent: 'totalSpent',
    createdAt: 'createdAt'
  };

  export type CustomerScalarFieldEnum = (typeof CustomerScalarFieldEnum)[keyof typeof CustomerScalarFieldEnum]


  export const LeadScalarFieldEnum: {
    id: 'id',
    name: 'name',
    email: 'email',
    phone: 'phone',
    source: 'source',
    createdAt: 'createdAt'
  };

  export type LeadScalarFieldEnum = (typeof LeadScalarFieldEnum)[keyof typeof LeadScalarFieldEnum]


  export const CampaignLogScalarFieldEnum: {
    id: 'id',
    type: 'type',
    status: 'status',
    recipient: 'recipient',
    createdAt: 'createdAt'
  };

  export type CampaignLogScalarFieldEnum = (typeof CampaignLogScalarFieldEnum)[keyof typeof CampaignLogScalarFieldEnum]


  export const CaptureOrderScalarFieldEnum: {
    id: 'id',
    customerName: 'customerName',
    quantity: 'quantity',
    product: 'product',
    printType: 'printType',
    dueDate: 'dueDate',
    status: 'status',
    paymentStatus: 'paymentStatus',
    depositRequired: 'depositRequired',
    depositReceived: 'depositReceived',
    balanceDue: 'balanceDue',
    paymentNotes: 'paymentNotes',
    createdAt: 'createdAt'
  };

  export type CaptureOrderScalarFieldEnum = (typeof CaptureOrderScalarFieldEnum)[keyof typeof CaptureOrderScalarFieldEnum]


  export const CaptureTaskScalarFieldEnum: {
    id: 'id',
    orderId: 'orderId',
    title: 'title',
    status: 'status',
    createdAt: 'createdAt'
  };

  export type CaptureTaskScalarFieldEnum = (typeof CaptureTaskScalarFieldEnum)[keyof typeof CaptureTaskScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    
  /**
   * Deep Input Types
   */


  export type CustomerWhereInput = {
    AND?: CustomerWhereInput | CustomerWhereInput[]
    OR?: CustomerWhereInput[]
    NOT?: CustomerWhereInput | CustomerWhereInput[]
    id?: StringFilter<"Customer"> | string
    squareCustomerId?: StringFilter<"Customer"> | string
    name?: StringNullableFilter<"Customer"> | string | null
    email?: StringNullableFilter<"Customer"> | string | null
    phone?: StringNullableFilter<"Customer"> | string | null
    lastOrderDate?: DateTimeNullableFilter<"Customer"> | Date | string | null
    totalSpent?: FloatFilter<"Customer"> | number
    createdAt?: DateTimeFilter<"Customer"> | Date | string
  }

  export type CustomerOrderByWithRelationInput = {
    id?: SortOrder
    squareCustomerId?: SortOrder
    name?: SortOrderInput | SortOrder
    email?: SortOrderInput | SortOrder
    phone?: SortOrderInput | SortOrder
    lastOrderDate?: SortOrderInput | SortOrder
    totalSpent?: SortOrder
    createdAt?: SortOrder
  }

  export type CustomerWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    squareCustomerId?: string
    AND?: CustomerWhereInput | CustomerWhereInput[]
    OR?: CustomerWhereInput[]
    NOT?: CustomerWhereInput | CustomerWhereInput[]
    name?: StringNullableFilter<"Customer"> | string | null
    email?: StringNullableFilter<"Customer"> | string | null
    phone?: StringNullableFilter<"Customer"> | string | null
    lastOrderDate?: DateTimeNullableFilter<"Customer"> | Date | string | null
    totalSpent?: FloatFilter<"Customer"> | number
    createdAt?: DateTimeFilter<"Customer"> | Date | string
  }, "id" | "squareCustomerId">

  export type CustomerOrderByWithAggregationInput = {
    id?: SortOrder
    squareCustomerId?: SortOrder
    name?: SortOrderInput | SortOrder
    email?: SortOrderInput | SortOrder
    phone?: SortOrderInput | SortOrder
    lastOrderDate?: SortOrderInput | SortOrder
    totalSpent?: SortOrder
    createdAt?: SortOrder
    _count?: CustomerCountOrderByAggregateInput
    _avg?: CustomerAvgOrderByAggregateInput
    _max?: CustomerMaxOrderByAggregateInput
    _min?: CustomerMinOrderByAggregateInput
    _sum?: CustomerSumOrderByAggregateInput
  }

  export type CustomerScalarWhereWithAggregatesInput = {
    AND?: CustomerScalarWhereWithAggregatesInput | CustomerScalarWhereWithAggregatesInput[]
    OR?: CustomerScalarWhereWithAggregatesInput[]
    NOT?: CustomerScalarWhereWithAggregatesInput | CustomerScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Customer"> | string
    squareCustomerId?: StringWithAggregatesFilter<"Customer"> | string
    name?: StringNullableWithAggregatesFilter<"Customer"> | string | null
    email?: StringNullableWithAggregatesFilter<"Customer"> | string | null
    phone?: StringNullableWithAggregatesFilter<"Customer"> | string | null
    lastOrderDate?: DateTimeNullableWithAggregatesFilter<"Customer"> | Date | string | null
    totalSpent?: FloatWithAggregatesFilter<"Customer"> | number
    createdAt?: DateTimeWithAggregatesFilter<"Customer"> | Date | string
  }

  export type LeadWhereInput = {
    AND?: LeadWhereInput | LeadWhereInput[]
    OR?: LeadWhereInput[]
    NOT?: LeadWhereInput | LeadWhereInput[]
    id?: StringFilter<"Lead"> | string
    name?: StringFilter<"Lead"> | string
    email?: StringNullableFilter<"Lead"> | string | null
    phone?: StringNullableFilter<"Lead"> | string | null
    source?: StringFilter<"Lead"> | string
    createdAt?: DateTimeFilter<"Lead"> | Date | string
  }

  export type LeadOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrderInput | SortOrder
    phone?: SortOrderInput | SortOrder
    source?: SortOrder
    createdAt?: SortOrder
  }

  export type LeadWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: LeadWhereInput | LeadWhereInput[]
    OR?: LeadWhereInput[]
    NOT?: LeadWhereInput | LeadWhereInput[]
    name?: StringFilter<"Lead"> | string
    email?: StringNullableFilter<"Lead"> | string | null
    phone?: StringNullableFilter<"Lead"> | string | null
    source?: StringFilter<"Lead"> | string
    createdAt?: DateTimeFilter<"Lead"> | Date | string
  }, "id">

  export type LeadOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrderInput | SortOrder
    phone?: SortOrderInput | SortOrder
    source?: SortOrder
    createdAt?: SortOrder
    _count?: LeadCountOrderByAggregateInput
    _max?: LeadMaxOrderByAggregateInput
    _min?: LeadMinOrderByAggregateInput
  }

  export type LeadScalarWhereWithAggregatesInput = {
    AND?: LeadScalarWhereWithAggregatesInput | LeadScalarWhereWithAggregatesInput[]
    OR?: LeadScalarWhereWithAggregatesInput[]
    NOT?: LeadScalarWhereWithAggregatesInput | LeadScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Lead"> | string
    name?: StringWithAggregatesFilter<"Lead"> | string
    email?: StringNullableWithAggregatesFilter<"Lead"> | string | null
    phone?: StringNullableWithAggregatesFilter<"Lead"> | string | null
    source?: StringWithAggregatesFilter<"Lead"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Lead"> | Date | string
  }

  export type CampaignLogWhereInput = {
    AND?: CampaignLogWhereInput | CampaignLogWhereInput[]
    OR?: CampaignLogWhereInput[]
    NOT?: CampaignLogWhereInput | CampaignLogWhereInput[]
    id?: StringFilter<"CampaignLog"> | string
    type?: StringFilter<"CampaignLog"> | string
    status?: StringFilter<"CampaignLog"> | string
    recipient?: StringFilter<"CampaignLog"> | string
    createdAt?: DateTimeFilter<"CampaignLog"> | Date | string
  }

  export type CampaignLogOrderByWithRelationInput = {
    id?: SortOrder
    type?: SortOrder
    status?: SortOrder
    recipient?: SortOrder
    createdAt?: SortOrder
  }

  export type CampaignLogWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: CampaignLogWhereInput | CampaignLogWhereInput[]
    OR?: CampaignLogWhereInput[]
    NOT?: CampaignLogWhereInput | CampaignLogWhereInput[]
    type?: StringFilter<"CampaignLog"> | string
    status?: StringFilter<"CampaignLog"> | string
    recipient?: StringFilter<"CampaignLog"> | string
    createdAt?: DateTimeFilter<"CampaignLog"> | Date | string
  }, "id">

  export type CampaignLogOrderByWithAggregationInput = {
    id?: SortOrder
    type?: SortOrder
    status?: SortOrder
    recipient?: SortOrder
    createdAt?: SortOrder
    _count?: CampaignLogCountOrderByAggregateInput
    _max?: CampaignLogMaxOrderByAggregateInput
    _min?: CampaignLogMinOrderByAggregateInput
  }

  export type CampaignLogScalarWhereWithAggregatesInput = {
    AND?: CampaignLogScalarWhereWithAggregatesInput | CampaignLogScalarWhereWithAggregatesInput[]
    OR?: CampaignLogScalarWhereWithAggregatesInput[]
    NOT?: CampaignLogScalarWhereWithAggregatesInput | CampaignLogScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"CampaignLog"> | string
    type?: StringWithAggregatesFilter<"CampaignLog"> | string
    status?: StringWithAggregatesFilter<"CampaignLog"> | string
    recipient?: StringWithAggregatesFilter<"CampaignLog"> | string
    createdAt?: DateTimeWithAggregatesFilter<"CampaignLog"> | Date | string
  }

  export type CaptureOrderWhereInput = {
    AND?: CaptureOrderWhereInput | CaptureOrderWhereInput[]
    OR?: CaptureOrderWhereInput[]
    NOT?: CaptureOrderWhereInput | CaptureOrderWhereInput[]
    id?: StringFilter<"CaptureOrder"> | string
    customerName?: StringFilter<"CaptureOrder"> | string
    quantity?: IntFilter<"CaptureOrder"> | number
    product?: StringFilter<"CaptureOrder"> | string
    printType?: StringFilter<"CaptureOrder"> | string
    dueDate?: StringFilter<"CaptureOrder"> | string
    status?: StringFilter<"CaptureOrder"> | string
    paymentStatus?: StringFilter<"CaptureOrder"> | string
    depositRequired?: BoolFilter<"CaptureOrder"> | boolean
    depositReceived?: BoolFilter<"CaptureOrder"> | boolean
    balanceDue?: FloatFilter<"CaptureOrder"> | number
    paymentNotes?: StringFilter<"CaptureOrder"> | string
    createdAt?: DateTimeFilter<"CaptureOrder"> | Date | string
    tasks?: CaptureTaskListRelationFilter
  }

  export type CaptureOrderOrderByWithRelationInput = {
    id?: SortOrder
    customerName?: SortOrder
    quantity?: SortOrder
    product?: SortOrder
    printType?: SortOrder
    dueDate?: SortOrder
    status?: SortOrder
    paymentStatus?: SortOrder
    depositRequired?: SortOrder
    depositReceived?: SortOrder
    balanceDue?: SortOrder
    paymentNotes?: SortOrder
    createdAt?: SortOrder
    tasks?: CaptureTaskOrderByRelationAggregateInput
  }

  export type CaptureOrderWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: CaptureOrderWhereInput | CaptureOrderWhereInput[]
    OR?: CaptureOrderWhereInput[]
    NOT?: CaptureOrderWhereInput | CaptureOrderWhereInput[]
    customerName?: StringFilter<"CaptureOrder"> | string
    quantity?: IntFilter<"CaptureOrder"> | number
    product?: StringFilter<"CaptureOrder"> | string
    printType?: StringFilter<"CaptureOrder"> | string
    dueDate?: StringFilter<"CaptureOrder"> | string
    status?: StringFilter<"CaptureOrder"> | string
    paymentStatus?: StringFilter<"CaptureOrder"> | string
    depositRequired?: BoolFilter<"CaptureOrder"> | boolean
    depositReceived?: BoolFilter<"CaptureOrder"> | boolean
    balanceDue?: FloatFilter<"CaptureOrder"> | number
    paymentNotes?: StringFilter<"CaptureOrder"> | string
    createdAt?: DateTimeFilter<"CaptureOrder"> | Date | string
    tasks?: CaptureTaskListRelationFilter
  }, "id">

  export type CaptureOrderOrderByWithAggregationInput = {
    id?: SortOrder
    customerName?: SortOrder
    quantity?: SortOrder
    product?: SortOrder
    printType?: SortOrder
    dueDate?: SortOrder
    status?: SortOrder
    paymentStatus?: SortOrder
    depositRequired?: SortOrder
    depositReceived?: SortOrder
    balanceDue?: SortOrder
    paymentNotes?: SortOrder
    createdAt?: SortOrder
    _count?: CaptureOrderCountOrderByAggregateInput
    _avg?: CaptureOrderAvgOrderByAggregateInput
    _max?: CaptureOrderMaxOrderByAggregateInput
    _min?: CaptureOrderMinOrderByAggregateInput
    _sum?: CaptureOrderSumOrderByAggregateInput
  }

  export type CaptureOrderScalarWhereWithAggregatesInput = {
    AND?: CaptureOrderScalarWhereWithAggregatesInput | CaptureOrderScalarWhereWithAggregatesInput[]
    OR?: CaptureOrderScalarWhereWithAggregatesInput[]
    NOT?: CaptureOrderScalarWhereWithAggregatesInput | CaptureOrderScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"CaptureOrder"> | string
    customerName?: StringWithAggregatesFilter<"CaptureOrder"> | string
    quantity?: IntWithAggregatesFilter<"CaptureOrder"> | number
    product?: StringWithAggregatesFilter<"CaptureOrder"> | string
    printType?: StringWithAggregatesFilter<"CaptureOrder"> | string
    dueDate?: StringWithAggregatesFilter<"CaptureOrder"> | string
    status?: StringWithAggregatesFilter<"CaptureOrder"> | string
    paymentStatus?: StringWithAggregatesFilter<"CaptureOrder"> | string
    depositRequired?: BoolWithAggregatesFilter<"CaptureOrder"> | boolean
    depositReceived?: BoolWithAggregatesFilter<"CaptureOrder"> | boolean
    balanceDue?: FloatWithAggregatesFilter<"CaptureOrder"> | number
    paymentNotes?: StringWithAggregatesFilter<"CaptureOrder"> | string
    createdAt?: DateTimeWithAggregatesFilter<"CaptureOrder"> | Date | string
  }

  export type CaptureTaskWhereInput = {
    AND?: CaptureTaskWhereInput | CaptureTaskWhereInput[]
    OR?: CaptureTaskWhereInput[]
    NOT?: CaptureTaskWhereInput | CaptureTaskWhereInput[]
    id?: StringFilter<"CaptureTask"> | string
    orderId?: StringFilter<"CaptureTask"> | string
    title?: StringFilter<"CaptureTask"> | string
    status?: StringFilter<"CaptureTask"> | string
    createdAt?: DateTimeFilter<"CaptureTask"> | Date | string
    order?: XOR<CaptureOrderScalarRelationFilter, CaptureOrderWhereInput>
  }

  export type CaptureTaskOrderByWithRelationInput = {
    id?: SortOrder
    orderId?: SortOrder
    title?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    order?: CaptureOrderOrderByWithRelationInput
  }

  export type CaptureTaskWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: CaptureTaskWhereInput | CaptureTaskWhereInput[]
    OR?: CaptureTaskWhereInput[]
    NOT?: CaptureTaskWhereInput | CaptureTaskWhereInput[]
    orderId?: StringFilter<"CaptureTask"> | string
    title?: StringFilter<"CaptureTask"> | string
    status?: StringFilter<"CaptureTask"> | string
    createdAt?: DateTimeFilter<"CaptureTask"> | Date | string
    order?: XOR<CaptureOrderScalarRelationFilter, CaptureOrderWhereInput>
  }, "id">

  export type CaptureTaskOrderByWithAggregationInput = {
    id?: SortOrder
    orderId?: SortOrder
    title?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    _count?: CaptureTaskCountOrderByAggregateInput
    _max?: CaptureTaskMaxOrderByAggregateInput
    _min?: CaptureTaskMinOrderByAggregateInput
  }

  export type CaptureTaskScalarWhereWithAggregatesInput = {
    AND?: CaptureTaskScalarWhereWithAggregatesInput | CaptureTaskScalarWhereWithAggregatesInput[]
    OR?: CaptureTaskScalarWhereWithAggregatesInput[]
    NOT?: CaptureTaskScalarWhereWithAggregatesInput | CaptureTaskScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"CaptureTask"> | string
    orderId?: StringWithAggregatesFilter<"CaptureTask"> | string
    title?: StringWithAggregatesFilter<"CaptureTask"> | string
    status?: StringWithAggregatesFilter<"CaptureTask"> | string
    createdAt?: DateTimeWithAggregatesFilter<"CaptureTask"> | Date | string
  }

  export type CustomerCreateInput = {
    id?: string
    squareCustomerId: string
    name?: string | null
    email?: string | null
    phone?: string | null
    lastOrderDate?: Date | string | null
    totalSpent?: number
    createdAt?: Date | string
  }

  export type CustomerUncheckedCreateInput = {
    id?: string
    squareCustomerId: string
    name?: string | null
    email?: string | null
    phone?: string | null
    lastOrderDate?: Date | string | null
    totalSpent?: number
    createdAt?: Date | string
  }

  export type CustomerUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    squareCustomerId?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    lastOrderDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    totalSpent?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CustomerUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    squareCustomerId?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    lastOrderDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    totalSpent?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CustomerCreateManyInput = {
    id?: string
    squareCustomerId: string
    name?: string | null
    email?: string | null
    phone?: string | null
    lastOrderDate?: Date | string | null
    totalSpent?: number
    createdAt?: Date | string
  }

  export type CustomerUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    squareCustomerId?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    lastOrderDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    totalSpent?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CustomerUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    squareCustomerId?: StringFieldUpdateOperationsInput | string
    name?: NullableStringFieldUpdateOperationsInput | string | null
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    lastOrderDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    totalSpent?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LeadCreateInput = {
    id?: string
    name: string
    email?: string | null
    phone?: string | null
    source?: string
    createdAt?: Date | string
  }

  export type LeadUncheckedCreateInput = {
    id?: string
    name: string
    email?: string | null
    phone?: string | null
    source?: string
    createdAt?: Date | string
  }

  export type LeadUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LeadUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LeadCreateManyInput = {
    id?: string
    name: string
    email?: string | null
    phone?: string | null
    source?: string
    createdAt?: Date | string
  }

  export type LeadUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LeadUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CampaignLogCreateInput = {
    id?: string
    type: string
    status: string
    recipient: string
    createdAt?: Date | string
  }

  export type CampaignLogUncheckedCreateInput = {
    id?: string
    type: string
    status: string
    recipient: string
    createdAt?: Date | string
  }

  export type CampaignLogUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    recipient?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CampaignLogUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    recipient?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CampaignLogCreateManyInput = {
    id?: string
    type: string
    status: string
    recipient: string
    createdAt?: Date | string
  }

  export type CampaignLogUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    recipient?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CampaignLogUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    recipient?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CaptureOrderCreateInput = {
    id?: string
    customerName: string
    quantity?: number
    product?: string
    printType?: string
    dueDate?: string
    status?: string
    paymentStatus?: string
    depositRequired?: boolean
    depositReceived?: boolean
    balanceDue?: number
    paymentNotes?: string
    createdAt?: Date | string
    tasks?: CaptureTaskCreateNestedManyWithoutOrderInput
  }

  export type CaptureOrderUncheckedCreateInput = {
    id?: string
    customerName: string
    quantity?: number
    product?: string
    printType?: string
    dueDate?: string
    status?: string
    paymentStatus?: string
    depositRequired?: boolean
    depositReceived?: boolean
    balanceDue?: number
    paymentNotes?: string
    createdAt?: Date | string
    tasks?: CaptureTaskUncheckedCreateNestedManyWithoutOrderInput
  }

  export type CaptureOrderUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    customerName?: StringFieldUpdateOperationsInput | string
    quantity?: IntFieldUpdateOperationsInput | number
    product?: StringFieldUpdateOperationsInput | string
    printType?: StringFieldUpdateOperationsInput | string
    dueDate?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    paymentStatus?: StringFieldUpdateOperationsInput | string
    depositRequired?: BoolFieldUpdateOperationsInput | boolean
    depositReceived?: BoolFieldUpdateOperationsInput | boolean
    balanceDue?: FloatFieldUpdateOperationsInput | number
    paymentNotes?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tasks?: CaptureTaskUpdateManyWithoutOrderNestedInput
  }

  export type CaptureOrderUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    customerName?: StringFieldUpdateOperationsInput | string
    quantity?: IntFieldUpdateOperationsInput | number
    product?: StringFieldUpdateOperationsInput | string
    printType?: StringFieldUpdateOperationsInput | string
    dueDate?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    paymentStatus?: StringFieldUpdateOperationsInput | string
    depositRequired?: BoolFieldUpdateOperationsInput | boolean
    depositReceived?: BoolFieldUpdateOperationsInput | boolean
    balanceDue?: FloatFieldUpdateOperationsInput | number
    paymentNotes?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tasks?: CaptureTaskUncheckedUpdateManyWithoutOrderNestedInput
  }

  export type CaptureOrderCreateManyInput = {
    id?: string
    customerName: string
    quantity?: number
    product?: string
    printType?: string
    dueDate?: string
    status?: string
    paymentStatus?: string
    depositRequired?: boolean
    depositReceived?: boolean
    balanceDue?: number
    paymentNotes?: string
    createdAt?: Date | string
  }

  export type CaptureOrderUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    customerName?: StringFieldUpdateOperationsInput | string
    quantity?: IntFieldUpdateOperationsInput | number
    product?: StringFieldUpdateOperationsInput | string
    printType?: StringFieldUpdateOperationsInput | string
    dueDate?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    paymentStatus?: StringFieldUpdateOperationsInput | string
    depositRequired?: BoolFieldUpdateOperationsInput | boolean
    depositReceived?: BoolFieldUpdateOperationsInput | boolean
    balanceDue?: FloatFieldUpdateOperationsInput | number
    paymentNotes?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CaptureOrderUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    customerName?: StringFieldUpdateOperationsInput | string
    quantity?: IntFieldUpdateOperationsInput | number
    product?: StringFieldUpdateOperationsInput | string
    printType?: StringFieldUpdateOperationsInput | string
    dueDate?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    paymentStatus?: StringFieldUpdateOperationsInput | string
    depositRequired?: BoolFieldUpdateOperationsInput | boolean
    depositReceived?: BoolFieldUpdateOperationsInput | boolean
    balanceDue?: FloatFieldUpdateOperationsInput | number
    paymentNotes?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CaptureTaskCreateInput = {
    id?: string
    title: string
    status?: string
    createdAt?: Date | string
    order: CaptureOrderCreateNestedOneWithoutTasksInput
  }

  export type CaptureTaskUncheckedCreateInput = {
    id?: string
    orderId: string
    title: string
    status?: string
    createdAt?: Date | string
  }

  export type CaptureTaskUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    order?: CaptureOrderUpdateOneRequiredWithoutTasksNestedInput
  }

  export type CaptureTaskUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    orderId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CaptureTaskCreateManyInput = {
    id?: string
    orderId: string
    title: string
    status?: string
    createdAt?: Date | string
  }

  export type CaptureTaskUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CaptureTaskUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    orderId?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type FloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type CustomerCountOrderByAggregateInput = {
    id?: SortOrder
    squareCustomerId?: SortOrder
    name?: SortOrder
    email?: SortOrder
    phone?: SortOrder
    lastOrderDate?: SortOrder
    totalSpent?: SortOrder
    createdAt?: SortOrder
  }

  export type CustomerAvgOrderByAggregateInput = {
    totalSpent?: SortOrder
  }

  export type CustomerMaxOrderByAggregateInput = {
    id?: SortOrder
    squareCustomerId?: SortOrder
    name?: SortOrder
    email?: SortOrder
    phone?: SortOrder
    lastOrderDate?: SortOrder
    totalSpent?: SortOrder
    createdAt?: SortOrder
  }

  export type CustomerMinOrderByAggregateInput = {
    id?: SortOrder
    squareCustomerId?: SortOrder
    name?: SortOrder
    email?: SortOrder
    phone?: SortOrder
    lastOrderDate?: SortOrder
    totalSpent?: SortOrder
    createdAt?: SortOrder
  }

  export type CustomerSumOrderByAggregateInput = {
    totalSpent?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type FloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type LeadCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    phone?: SortOrder
    source?: SortOrder
    createdAt?: SortOrder
  }

  export type LeadMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    phone?: SortOrder
    source?: SortOrder
    createdAt?: SortOrder
  }

  export type LeadMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    phone?: SortOrder
    source?: SortOrder
    createdAt?: SortOrder
  }

  export type CampaignLogCountOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    status?: SortOrder
    recipient?: SortOrder
    createdAt?: SortOrder
  }

  export type CampaignLogMaxOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    status?: SortOrder
    recipient?: SortOrder
    createdAt?: SortOrder
  }

  export type CampaignLogMinOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    status?: SortOrder
    recipient?: SortOrder
    createdAt?: SortOrder
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type CaptureTaskListRelationFilter = {
    every?: CaptureTaskWhereInput
    some?: CaptureTaskWhereInput
    none?: CaptureTaskWhereInput
  }

  export type CaptureTaskOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type CaptureOrderCountOrderByAggregateInput = {
    id?: SortOrder
    customerName?: SortOrder
    quantity?: SortOrder
    product?: SortOrder
    printType?: SortOrder
    dueDate?: SortOrder
    status?: SortOrder
    paymentStatus?: SortOrder
    depositRequired?: SortOrder
    depositReceived?: SortOrder
    balanceDue?: SortOrder
    paymentNotes?: SortOrder
    createdAt?: SortOrder
  }

  export type CaptureOrderAvgOrderByAggregateInput = {
    quantity?: SortOrder
    balanceDue?: SortOrder
  }

  export type CaptureOrderMaxOrderByAggregateInput = {
    id?: SortOrder
    customerName?: SortOrder
    quantity?: SortOrder
    product?: SortOrder
    printType?: SortOrder
    dueDate?: SortOrder
    status?: SortOrder
    paymentStatus?: SortOrder
    depositRequired?: SortOrder
    depositReceived?: SortOrder
    balanceDue?: SortOrder
    paymentNotes?: SortOrder
    createdAt?: SortOrder
  }

  export type CaptureOrderMinOrderByAggregateInput = {
    id?: SortOrder
    customerName?: SortOrder
    quantity?: SortOrder
    product?: SortOrder
    printType?: SortOrder
    dueDate?: SortOrder
    status?: SortOrder
    paymentStatus?: SortOrder
    depositRequired?: SortOrder
    depositReceived?: SortOrder
    balanceDue?: SortOrder
    paymentNotes?: SortOrder
    createdAt?: SortOrder
  }

  export type CaptureOrderSumOrderByAggregateInput = {
    quantity?: SortOrder
    balanceDue?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type CaptureOrderScalarRelationFilter = {
    is?: CaptureOrderWhereInput
    isNot?: CaptureOrderWhereInput
  }

  export type CaptureTaskCountOrderByAggregateInput = {
    id?: SortOrder
    orderId?: SortOrder
    title?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
  }

  export type CaptureTaskMaxOrderByAggregateInput = {
    id?: SortOrder
    orderId?: SortOrder
    title?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
  }

  export type CaptureTaskMinOrderByAggregateInput = {
    id?: SortOrder
    orderId?: SortOrder
    title?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type FloatFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type CaptureTaskCreateNestedManyWithoutOrderInput = {
    create?: XOR<CaptureTaskCreateWithoutOrderInput, CaptureTaskUncheckedCreateWithoutOrderInput> | CaptureTaskCreateWithoutOrderInput[] | CaptureTaskUncheckedCreateWithoutOrderInput[]
    connectOrCreate?: CaptureTaskCreateOrConnectWithoutOrderInput | CaptureTaskCreateOrConnectWithoutOrderInput[]
    createMany?: CaptureTaskCreateManyOrderInputEnvelope
    connect?: CaptureTaskWhereUniqueInput | CaptureTaskWhereUniqueInput[]
  }

  export type CaptureTaskUncheckedCreateNestedManyWithoutOrderInput = {
    create?: XOR<CaptureTaskCreateWithoutOrderInput, CaptureTaskUncheckedCreateWithoutOrderInput> | CaptureTaskCreateWithoutOrderInput[] | CaptureTaskUncheckedCreateWithoutOrderInput[]
    connectOrCreate?: CaptureTaskCreateOrConnectWithoutOrderInput | CaptureTaskCreateOrConnectWithoutOrderInput[]
    createMany?: CaptureTaskCreateManyOrderInputEnvelope
    connect?: CaptureTaskWhereUniqueInput | CaptureTaskWhereUniqueInput[]
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type CaptureTaskUpdateManyWithoutOrderNestedInput = {
    create?: XOR<CaptureTaskCreateWithoutOrderInput, CaptureTaskUncheckedCreateWithoutOrderInput> | CaptureTaskCreateWithoutOrderInput[] | CaptureTaskUncheckedCreateWithoutOrderInput[]
    connectOrCreate?: CaptureTaskCreateOrConnectWithoutOrderInput | CaptureTaskCreateOrConnectWithoutOrderInput[]
    upsert?: CaptureTaskUpsertWithWhereUniqueWithoutOrderInput | CaptureTaskUpsertWithWhereUniqueWithoutOrderInput[]
    createMany?: CaptureTaskCreateManyOrderInputEnvelope
    set?: CaptureTaskWhereUniqueInput | CaptureTaskWhereUniqueInput[]
    disconnect?: CaptureTaskWhereUniqueInput | CaptureTaskWhereUniqueInput[]
    delete?: CaptureTaskWhereUniqueInput | CaptureTaskWhereUniqueInput[]
    connect?: CaptureTaskWhereUniqueInput | CaptureTaskWhereUniqueInput[]
    update?: CaptureTaskUpdateWithWhereUniqueWithoutOrderInput | CaptureTaskUpdateWithWhereUniqueWithoutOrderInput[]
    updateMany?: CaptureTaskUpdateManyWithWhereWithoutOrderInput | CaptureTaskUpdateManyWithWhereWithoutOrderInput[]
    deleteMany?: CaptureTaskScalarWhereInput | CaptureTaskScalarWhereInput[]
  }

  export type CaptureTaskUncheckedUpdateManyWithoutOrderNestedInput = {
    create?: XOR<CaptureTaskCreateWithoutOrderInput, CaptureTaskUncheckedCreateWithoutOrderInput> | CaptureTaskCreateWithoutOrderInput[] | CaptureTaskUncheckedCreateWithoutOrderInput[]
    connectOrCreate?: CaptureTaskCreateOrConnectWithoutOrderInput | CaptureTaskCreateOrConnectWithoutOrderInput[]
    upsert?: CaptureTaskUpsertWithWhereUniqueWithoutOrderInput | CaptureTaskUpsertWithWhereUniqueWithoutOrderInput[]
    createMany?: CaptureTaskCreateManyOrderInputEnvelope
    set?: CaptureTaskWhereUniqueInput | CaptureTaskWhereUniqueInput[]
    disconnect?: CaptureTaskWhereUniqueInput | CaptureTaskWhereUniqueInput[]
    delete?: CaptureTaskWhereUniqueInput | CaptureTaskWhereUniqueInput[]
    connect?: CaptureTaskWhereUniqueInput | CaptureTaskWhereUniqueInput[]
    update?: CaptureTaskUpdateWithWhereUniqueWithoutOrderInput | CaptureTaskUpdateWithWhereUniqueWithoutOrderInput[]
    updateMany?: CaptureTaskUpdateManyWithWhereWithoutOrderInput | CaptureTaskUpdateManyWithWhereWithoutOrderInput[]
    deleteMany?: CaptureTaskScalarWhereInput | CaptureTaskScalarWhereInput[]
  }

  export type CaptureOrderCreateNestedOneWithoutTasksInput = {
    create?: XOR<CaptureOrderCreateWithoutTasksInput, CaptureOrderUncheckedCreateWithoutTasksInput>
    connectOrCreate?: CaptureOrderCreateOrConnectWithoutTasksInput
    connect?: CaptureOrderWhereUniqueInput
  }

  export type CaptureOrderUpdateOneRequiredWithoutTasksNestedInput = {
    create?: XOR<CaptureOrderCreateWithoutTasksInput, CaptureOrderUncheckedCreateWithoutTasksInput>
    connectOrCreate?: CaptureOrderCreateOrConnectWithoutTasksInput
    upsert?: CaptureOrderUpsertWithoutTasksInput
    connect?: CaptureOrderWhereUniqueInput
    update?: XOR<XOR<CaptureOrderUpdateToOneWithWhereWithoutTasksInput, CaptureOrderUpdateWithoutTasksInput>, CaptureOrderUncheckedUpdateWithoutTasksInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedFloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type CaptureTaskCreateWithoutOrderInput = {
    id?: string
    title: string
    status?: string
    createdAt?: Date | string
  }

  export type CaptureTaskUncheckedCreateWithoutOrderInput = {
    id?: string
    title: string
    status?: string
    createdAt?: Date | string
  }

  export type CaptureTaskCreateOrConnectWithoutOrderInput = {
    where: CaptureTaskWhereUniqueInput
    create: XOR<CaptureTaskCreateWithoutOrderInput, CaptureTaskUncheckedCreateWithoutOrderInput>
  }

  export type CaptureTaskCreateManyOrderInputEnvelope = {
    data: CaptureTaskCreateManyOrderInput | CaptureTaskCreateManyOrderInput[]
  }

  export type CaptureTaskUpsertWithWhereUniqueWithoutOrderInput = {
    where: CaptureTaskWhereUniqueInput
    update: XOR<CaptureTaskUpdateWithoutOrderInput, CaptureTaskUncheckedUpdateWithoutOrderInput>
    create: XOR<CaptureTaskCreateWithoutOrderInput, CaptureTaskUncheckedCreateWithoutOrderInput>
  }

  export type CaptureTaskUpdateWithWhereUniqueWithoutOrderInput = {
    where: CaptureTaskWhereUniqueInput
    data: XOR<CaptureTaskUpdateWithoutOrderInput, CaptureTaskUncheckedUpdateWithoutOrderInput>
  }

  export type CaptureTaskUpdateManyWithWhereWithoutOrderInput = {
    where: CaptureTaskScalarWhereInput
    data: XOR<CaptureTaskUpdateManyMutationInput, CaptureTaskUncheckedUpdateManyWithoutOrderInput>
  }

  export type CaptureTaskScalarWhereInput = {
    AND?: CaptureTaskScalarWhereInput | CaptureTaskScalarWhereInput[]
    OR?: CaptureTaskScalarWhereInput[]
    NOT?: CaptureTaskScalarWhereInput | CaptureTaskScalarWhereInput[]
    id?: StringFilter<"CaptureTask"> | string
    orderId?: StringFilter<"CaptureTask"> | string
    title?: StringFilter<"CaptureTask"> | string
    status?: StringFilter<"CaptureTask"> | string
    createdAt?: DateTimeFilter<"CaptureTask"> | Date | string
  }

  export type CaptureOrderCreateWithoutTasksInput = {
    id?: string
    customerName: string
    quantity?: number
    product?: string
    printType?: string
    dueDate?: string
    status?: string
    paymentStatus?: string
    depositRequired?: boolean
    depositReceived?: boolean
    balanceDue?: number
    paymentNotes?: string
    createdAt?: Date | string
  }

  export type CaptureOrderUncheckedCreateWithoutTasksInput = {
    id?: string
    customerName: string
    quantity?: number
    product?: string
    printType?: string
    dueDate?: string
    status?: string
    paymentStatus?: string
    depositRequired?: boolean
    depositReceived?: boolean
    balanceDue?: number
    paymentNotes?: string
    createdAt?: Date | string
  }

  export type CaptureOrderCreateOrConnectWithoutTasksInput = {
    where: CaptureOrderWhereUniqueInput
    create: XOR<CaptureOrderCreateWithoutTasksInput, CaptureOrderUncheckedCreateWithoutTasksInput>
  }

  export type CaptureOrderUpsertWithoutTasksInput = {
    update: XOR<CaptureOrderUpdateWithoutTasksInput, CaptureOrderUncheckedUpdateWithoutTasksInput>
    create: XOR<CaptureOrderCreateWithoutTasksInput, CaptureOrderUncheckedCreateWithoutTasksInput>
    where?: CaptureOrderWhereInput
  }

  export type CaptureOrderUpdateToOneWithWhereWithoutTasksInput = {
    where?: CaptureOrderWhereInput
    data: XOR<CaptureOrderUpdateWithoutTasksInput, CaptureOrderUncheckedUpdateWithoutTasksInput>
  }

  export type CaptureOrderUpdateWithoutTasksInput = {
    id?: StringFieldUpdateOperationsInput | string
    customerName?: StringFieldUpdateOperationsInput | string
    quantity?: IntFieldUpdateOperationsInput | number
    product?: StringFieldUpdateOperationsInput | string
    printType?: StringFieldUpdateOperationsInput | string
    dueDate?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    paymentStatus?: StringFieldUpdateOperationsInput | string
    depositRequired?: BoolFieldUpdateOperationsInput | boolean
    depositReceived?: BoolFieldUpdateOperationsInput | boolean
    balanceDue?: FloatFieldUpdateOperationsInput | number
    paymentNotes?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CaptureOrderUncheckedUpdateWithoutTasksInput = {
    id?: StringFieldUpdateOperationsInput | string
    customerName?: StringFieldUpdateOperationsInput | string
    quantity?: IntFieldUpdateOperationsInput | number
    product?: StringFieldUpdateOperationsInput | string
    printType?: StringFieldUpdateOperationsInput | string
    dueDate?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    paymentStatus?: StringFieldUpdateOperationsInput | string
    depositRequired?: BoolFieldUpdateOperationsInput | boolean
    depositReceived?: BoolFieldUpdateOperationsInput | boolean
    balanceDue?: FloatFieldUpdateOperationsInput | number
    paymentNotes?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CaptureTaskCreateManyOrderInput = {
    id?: string
    title: string
    status?: string
    createdAt?: Date | string
  }

  export type CaptureTaskUpdateWithoutOrderInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CaptureTaskUncheckedUpdateWithoutOrderInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CaptureTaskUncheckedUpdateManyWithoutOrderInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}