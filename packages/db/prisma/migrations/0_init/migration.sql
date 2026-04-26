npm warn Unknown project config "auto-install-peers". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "strict-peer-dependencies". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "shamefully-hoist". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
Error: 
`--to-schema-datamodel` was removed. Please use `--[from/to]-schema` instead.

Usage

  $ prisma migrate diff [options]

Options

  -h, --help               Display this help message
  --config                 Custom path to your Prisma config file
  -o, --output             Writes to a file instead of stdout

From and To inputs (1 `--from-...` and 1 `--to-...` must be provided):
  --from-empty             Flag to assume from or to is an empty datamodel
  --to-empty

  --from-schema            Path to a Prisma schema file, uses the datamodel for the diff
  --to-schema

  --from-migrations        Path to the Prisma Migrate migrations directory
  --to-migrations

  --from-config-datasource Flag to use the datasource from the Prisma config file
  --to-config-datasource

Flags

  --script                 Render a SQL script to stdout instead of the default human readable summary (not supported on MongoDB)
  --exit-code              Change the exit code behavior to signal if the diff is empty or not (Empty: 0, Error: 1, Not empty: 2). Default behavior is Success: 0, Error: 1.


-- Manual constraints (preserved across schema regenerations)
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_available_units_nonneg" CHECK ("availableUnits" >= 0);
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_reserved_units_nonneg" CHECK ("reservedUnits" >= 0);
CREATE UNIQUE INDEX "tariff_only_one_default" ON "tariff"("isDefault") WHERE "isDefault" = TRUE;
CREATE UNIQUE INDEX "coupon_redemption_request_unique" ON "coupon_redemption"("couponId","userId","apiRequestId") WHERE "apiRequestId" IS NOT NULL;
CREATE UNIQUE INDEX "coupon_redemption_deposit_unique" ON "coupon_redemption"("couponId","userId","depositId") WHERE "depositId" IS NOT NULL;
CREATE UNIQUE INDEX "coupon_redemption_standalone_unique" ON "coupon_redemption"("couponId","userId") WHERE "apiRequestId" IS NULL AND "depositId" IS NULL;
