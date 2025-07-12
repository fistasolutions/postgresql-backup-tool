
# PostgreSQL Backup Tool

This is a Node.js application that provides functionality to export and import PostgreSQL database backups. The application uses Express.js, the `pg` library for PostgreSQL integration, and Multer for file handling.

## Features

- Export PostgreSQL database schema and data to a `.sql` file.
- Export specific table data to a `.sql` file.
- List all tables in the database with separation of user tables and system tables.
- Import `.sql` file into a PostgreSQL database.
- Set the PostgreSQL connection string dynamically via API.
- **NEW**: Smart system table detection and validation to prevent export of problematic data.
- **NEW**: Enhanced data formatting for PostgreSQL-specific data types.
- **NEW**: Improved error handling for system tables like `pg_user_mapping`, `pg_proc`, etc.

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

- Node.js (v14 or later)
- PostgreSQL (with a running instance)
- npm (comes with Node.js)

## Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/yourusername/postgresql-backup-tool.git
   ```

2. Navigate to the project directory:

   ```bash
   cd postgresql-backup-tool
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

## Usage

### 1. Start the server

Run the following command to start the server:

```bash
node index.js
```

The server will run on `http://localhost:5000`.

### 2. API Endpoints

#### a) Set PostgreSQL Connection String

**Endpoint**: `POST /backup/set-connection`  
**Body**:
```json
{
  "connectionString": "your_postgresql_connection_string"
}
```
**Response**:  
`Connection string received`

#### b) List Tables

**Endpoint**: `POST /backup/list-tables`  
**Body**:
```json
{
  "connectionString": "your_postgresql_connection_string"
}
```
**Response**:
```json
{
  "success": true,
  "userTables": ["users", "posts", "comments"],
  "systemTables": ["pg_user_mapping", "pg_proc", "pg_stat_activity"],
  "userTableCount": 3,
  "systemTableCount": 3,
  "totalCount": 6,
  "message": "Found 3 user tables and 3 system tables. Only user tables can be safely exported."
}
```

#### c) Export Database Backup

**Endpoint**: `POST /backup/export`  
**Body**:
```json
{
  "connectionString": "your_postgresql_connection_string"
}
```
**Response**:  
Triggers a download for `backup.sql`, which contains the exported database schema and data.

#### d) Export Specific Table

**Endpoint**: `POST /backup/export-table`  
**Body**:
```json
{
  "connectionString": "your_postgresql_connection_string",
  "tableName": "users"
}
```
**Response**:  
Triggers a download for `{tableName}_backup.sql`, which contains the exported table schema and data.

#### e) Import Database Backup

**Endpoint**: `POST /backup/import`  
**Form-Data**:  
- **file**: The `.sql` file to be imported.

**Response**:  
`Database imported successfully` or an error message.

### 3. System Table Protection

The application now includes intelligent protection against exporting system tables and problematic data:

- **Automatic Detection**: System tables (starting with `pg_`, `sql_`, containing `information_schema`, etc.) are automatically detected and excluded.
- **Column Validation**: Tables with system columns (containing `oid`, `pg_`, `mapping`, `proc`, etc.) are rejected.
- **Data Validation**: Actual data is validated to ensure it doesn't contain system-specific information.
- **Safe Formatting**: Enhanced `formatValue` function handles PostgreSQL-specific data types safely.

#### Fixed Issues

**System Column Names as Data Values**: Previously, when exporting tables, the system would sometimes return system column names (like `pg_foreign_data_wrapper_name_index`) instead of actual primary key values. This has been fixed by:

1. **Enhanced Detection**: The `formatValue` function now detects system column names and rejects them as data values
2. **Column Mismatch Validation**: The export process validates that the actual columns returned match the expected columns from the information schema
3. **System Column Filtering**: Tables with system columns are rejected before export attempts

**Example of the Fix**:
```sql
-- Before (incorrect):
INSERT INTO "spin_count" ("spin_id", "created_at", "user_id", "spin_value") 
VALUES ('pg_foreign_data_wrapper_name_index', '2025-02-24T15:46:26.517Z', 531, 10);

-- After (correct):
INSERT INTO "spin_count" ("spin_id", "created_at", "user_id", "spin_value") 
VALUES (123, '2025-02-24T15:46:26.517Z', 531, 10);
```

### 4. Error Handling

The application now provides better error messages:

- Clear indication when trying to export system tables
- Detailed error messages for problematic data
- Graceful handling of PostgreSQL-specific data types
- Validation of table structure before export

### 5. Notes

- Ensure the connection string has proper permissions to access the PostgreSQL database.
- For importing, the `.sql` file should contain valid SQL commands for PostgreSQL.
- **System tables cannot be exported** - this is by design to prevent data corruption.
- The application automatically skips problematic tables during full database export.

## Folder Structure

```
postgresql-backup-tool/
├── index.js          # Main application file
├── package.json      # Project metadata and dependencies
├── uploads/          # Temporary storage for uploaded files
└── backup.sql        # (Generated dynamically during export)
```

## Dependencies

- [express](https://www.npmjs.com/package/express): Web framework for Node.js.
- [body-parser](https://www.npmjs.com/package/body-parser): Middleware for parsing request bodies.
- [pg](https://www.npmjs.com/package/pg): PostgreSQL client for Node.js.
- [multer](https://www.npmjs.com/package/multer): Middleware for handling file uploads.
- [fs](https://nodejs.org/api/fs.html): Node.js file system module.
- [path](https://nodejs.org/api/path.html): Node.js module for file path utilities.

## Recent Improvements

### v2.0.0 - System Table Protection
- Added intelligent system table detection
- Enhanced data validation and formatting
- Improved error handling for PostgreSQL-specific data types
- Added table listing endpoint with user/system table separation
- Fixed issues with `pg_user_mapping`, `pg_proc`, and other system tables
- **FIXED**: System column names being returned as data values (e.g., `pg_foreign_data_wrapper_name_index` instead of actual primary key values)
- **FIXED**: Column mismatch detection between expected and actual column names
- **FIXED**: Enhanced `formatValue` function to detect and reject system column names as data

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

---

### Example Connection String
```bash
postgresql://username:password@host:port/database
```

For example:
```bash
postgresql://postgres:password@localhost:5432/mydatabase
```
