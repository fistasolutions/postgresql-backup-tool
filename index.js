const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;
let connectionString = '';

app.use(bodyParser.json());

// Set PostgreSQL connection string
app.post('/backup/set-connection', (req, res) => {
    connectionString = req.body.connectionString;
    res.send('Connection string received');
});

// Helper function to get schema and data
async function getDatabaseDump(pool) {
    const client = await pool.connect();
    try {
        // Get table schemas
        const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
    `);

        let sqlDump = '';

        for (let row of tablesRes.rows) {
            const tableName = row.table_name;

            // Get table creation statement
            const createTableRes = await client.query(`SELECT table_name, column_name, data_type
                                                 FROM information_schema.columns
                                                 WHERE table_name='${tableName}'`);

            sqlDump += `-- Table: ${tableName}\n`;
            sqlDump += `CREATE TABLE ${tableName} (\n`;

            createTableRes.rows.forEach((col, idx) => {
                sqlDump += `  ${col.column_name} ${col.data_type}`;
                if (idx < createTableRes.rows.length - 1) {
                    sqlDump += ',\n';
                }
            });

            sqlDump += '\n);\n\n';

            // Get table data
            const dataRes = await client.query(`SELECT * FROM ${tableName}`);
            if (dataRes.rows.length > 0) {
                sqlDump += `-- Data for table ${tableName}\n`;
                dataRes.rows.forEach(row => {
                    const columns = Object.keys(row).map(col => `"${col}"`).join(', ');
                    const values = Object.values(row).map(val => `'${val}'`).join(', ');
                    sqlDump += `INSERT INTO ${tableName} (${columns}) VALUES (${values});\n`;
                });
                sqlDump += '\n';
            }
        }

        return sqlDump;
    } finally {
        client.release();
    }
}

// Export database to a .sql file
app.post('/backup/export', async (req, res) => {
    const connectionString = req.body.connectionString;
    if (!connectionString) {
        return res.status(400).send('Connection string is not set');
    }

    const pool = new Pool({ connectionString });

    try {
        const sqlDump = await getDatabaseDump(pool);
        const filePath = path.join(__dirname, 'backup.sql');

        fs.writeFileSync(filePath, sqlDump);

        res.download(filePath, 'backup.sql', (err) => {
            if (err) {
                res.status(500).send(err.message);
            }
            fs.unlinkSync(filePath); // Remove the file after download
        });
    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    } finally {
        await pool.end();
    }
});

const upload = multer({ dest: 'uploads/' });

// Import a .sql file into the database
app.post('/backup/import', upload.single('file'), (req, res) => {
    if (!connectionString) {
        return res.status(400).send('Connection string is not set');
    }

    const filePath = req.file.path;
    const sqlCommands = fs.readFileSync(filePath, 'utf-8');

    const pool = new Pool({ connectionString });

    pool.query(sqlCommands, (error) => {
        fs.unlinkSync(filePath); // Remove the file after import
        if (error) {
            return res.status(500).send(`Error: ${error.message}`);
        }
        res.send('Database imported successfully');
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
