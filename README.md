
# PostgreSQL Backup Tool

This is a Node.js application that provides functionality to export and import PostgreSQL database backups. The application uses Express.js, the `pg` library for PostgreSQL integration, and Multer for file handling.

## Features

- Export PostgreSQL database schema and data to a `.sql` file.
- Import `.sql` file into a PostgreSQL database.
- Set the PostgreSQL connection string dynamically via API.

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

The server will run on `http://localhost:3000`.

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

#### b) Export Database Backup

**Endpoint**: `POST /backup/export`  
**Body**:
```json
{
  "connectionString": "your_postgresql_connection_string"
}
```
**Response**:  
Triggers a download for `backup.sql`, which contains the exported database schema and data.

#### c) Import Database Backup

**Endpoint**: `POST /backup/import`  
**Form-Data**:  
- **file**: The `.sql` file to be imported.

**Response**:  
`Database imported successfully` or an error message.

### 3. Notes

- Ensure the connection string has proper permissions to access the PostgreSQL database.
- For importing, the `.sql` file should contain valid SQL commands for PostgreSQL.

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
