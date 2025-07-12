const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 5000;
let connectionString = '';

app.use(bodyParser.json());

// Set PostgreSQL connection string
app.post('/backup/set-connection', (req, res) => {
    connectionString = req.body.connectionString;
    res.send('Connection string received');
});

// List all tables in public schema
app.post('/backup/list-tables', async (req, res) => {
    const { connectionString } = req.body;
    
    if (!connectionString) {
        return res.status(400).send('Connection string is required');
    }

    const pool = new Pool({ connectionString });

    try {
        const client = await pool.connect();
        
        const tablesRes = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
              AND table_name NOT LIKE 'pg_%'
              AND table_name NOT LIKE 'sql_%'
              AND table_name NOT LIKE 'information_schema%'
              AND table_name NOT LIKE 'pg_toast%'
            ORDER BY table_name;
        `);
        
        client.release();
        
        const tables = tablesRes.rows.map(row => row.table_name);
        res.json({
            success: true,
            tables: tables,
            count: tables.length
        });

    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    } finally {
        await pool.end();
    }
});

// Helper function to get schema and data
function formatValue(val) {
  if (val === null || val === undefined) return "NULL";
  
  // Handle PostgreSQL-specific types and system data
  if (typeof val === "number") {
    // Check if it's a valid number (not NaN or Infinity)
    if (isNaN(val) || !isFinite(val)) {
      return "NULL";
    }
    return val.toString();
  }
  
  if (typeof val === "string") {
    // Check for system column names that might be returned as data
    // Only reject if it looks like an actual system column name, not just any string with 'pg_'
    if ((val.startsWith('pg_') && val.includes('_')) && 
        (val.includes('foreign') || 
         val.includes('server') || 
         val.includes('wrapper') ||
         val.includes('index') ||
         val.includes('constraint') ||
         val.includes('mapping') ||
         val.includes('proc') ||
         val.includes('oid') ||
         val.includes('toast') ||
         val.includes('stat'))) {
        // This looks like a system column name, not actual data
        console.warn(`Detected system column name as data value: ${val}`);
        console.warn(`This might indicate a database query issue. Please check the table structure.`);
        return "NULL";
    }
    
    // Check for system table patterns that might cause issues
    if (val.includes('pg_') && (val.includes('mapping') || val.includes('proc') || val.includes('oid'))) {
      // For system table data, try to handle it more carefully
      if (val.match(/^[0-9]+$/)) {
        return val; // It's a numeric string, return as is
      }
    }
    
    // Debug: Log what we're processing
    if (val.includes('pg_') || val.includes('foreign') || val.includes('server')) {
        console.log(`Processing potentially problematic value: ${val}`);
    }
    
    return `'${val.replace(/'/g, "''")}'`; // Escape single quotes
  }
  
  if (val instanceof Date) {
    return `'${val.toISOString()}'`;
  }
  
  if (Array.isArray(val)) {
    // Handle PostgreSQL arrays
    const formattedArray = val.map(item => formatValue(item));
    return `ARRAY[${formattedArray.join(', ')}]`;
  }
  
  if (typeof val === "object") {
    // For objects, try to handle them as JSON, but be careful with system objects
    try {
      const jsonStr = JSON.stringify(val);
      // Only reject if it looks like an actual system column name
      if (jsonStr.startsWith('"pg_') && jsonStr.includes('_') && 
          (jsonStr.includes('foreign') || jsonStr.includes('server') || jsonStr.includes('wrapper') ||
           jsonStr.includes('index') || jsonStr.includes('constraint') || jsonStr.includes('mapping') ||
           jsonStr.includes('proc') || jsonStr.includes('oid') || jsonStr.includes('toast') || jsonStr.includes('stat'))) {
          return "NULL"; // Skip problematic system data
      }
      return `'${jsonStr.replace(/'/g, "''")}'`;
    } catch (e) {
      return "NULL"; // If JSON stringify fails, return NULL
    }
  }
  
  // For any other type, try to convert to string, but be safe
  try {
    const str = val.toString();
    // Only reject if it looks like an actual system column name
    if (str.startsWith('pg_') && str.includes('_') && 
        (str.includes('foreign') || str.includes('server') || str.includes('wrapper') ||
         str.includes('index') || str.includes('constraint') || str.includes('mapping') ||
         str.includes('proc') || str.includes('oid') || str.includes('toast') || str.includes('stat'))) {
      return "NULL";
    }
    return `'${str.replace(/'/g, "''")}'`;
  } catch (e) {
    return "NULL";
  }
}

function hasSystemColumns(columns) {
  return columns.some(col => 
    (col.startsWith('pg_') && col.includes('_') && 
     (col.includes('foreign') || col.includes('server') || col.includes('wrapper') ||
      col.includes('index') || col.includes('constraint') || col.includes('mapping') ||
      col.includes('proc') || col.includes('oid') || col.includes('toast') || col.includes('stat'))) ||
    col.includes('xid') ||
    col.includes('rel') ||
    col.includes('att')
  );
}

async function getDatabaseDump(pool) {
  const client = await pool.connect();
  try {
    // Get all public tables, excluding system tables
    const tablesRes = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema='public'
              AND table_type='BASE TABLE'
              AND table_name NOT LIKE 'pg_%'
              AND table_name NOT LIKE 'sql_%'
              AND table_name NOT LIKE 'information_schema%'
              AND table_name NOT LIKE 'pg_toast%'
              AND table_name NOT IN (
                'pg_stat_statements',
                'pg_stat_statements_info',
                'pg_stat_database',
                'pg_stat_user_tables',
                'pg_stat_user_indexes',
                'pg_stat_user_functions',
                'pg_stat_activity',
                'pg_stat_bgwriter',
                'pg_stat_database_conflicts',
                'pg_stat_locks',
                'pg_stat_replication',
                'pg_stat_sys_tables',
                'pg_stat_sys_indexes',
                'pg_stat_sys_functions',
                'pg_stat_xact_all_tables',
                'pg_stat_xact_sys_tables',
                'pg_stat_xact_user_functions',
                'pg_stat_xact_user_tables',
                'pg_stat_all_tables',
                'pg_stat_all_indexes',
                'pg_stat_all_functions',
                'pg_stat_archiver',
                'pg_stat_progress_analyze',
                'pg_stat_progress_basebackup',
                'pg_stat_progress_cluster',
                'pg_stat_progress_copy',
                'pg_stat_progress_create_index',
                'pg_stat_progress_vacuum',
                'pg_stat_slru',
                'pg_stat_ssl',
                'pg_stat_subscription',
                'pg_stat_wal',
                'pg_stat_wal_receiver',
                'pg_stat_xact_all_tables',
                'pg_stat_xact_sys_tables',
                'pg_stat_xact_user_functions',
                'pg_stat_xact_user_tables'
              );
        `);

    let sqlDump = "";

    for (const row of tablesRes.rows) {
      const tableName = row.table_name;

      // Build CREATE TABLE statement
      const columnsRes = await client.query(
        `
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1;
            `,
        [tableName]
      );

      sqlDump += `-- Table: ${tableName}\n`;
      sqlDump += `CREATE TABLE "${tableName}" (\n`;

      const columnDefs = columnsRes.rows.map((col) => {
        const nullability = col.is_nullable === "NO" ? "NOT NULL" : "";
        return `  "${col.column_name}" ${col.data_type} ${nullability}`.trim();
      });

      sqlDump += columnDefs.join(",\n") + "\n);\n\n";

      // Dump data
      // Get column names from information schema to ensure we select the right columns
      const columnNames = columnsRes.rows.map(col => col.column_name);
      const columnList = columnNames.map(col => `"${col}"`).join(', ');
      
      const dataRes = await client.query(`SELECT ${columnList} FROM public."${tableName}";`);
      if (dataRes.rows.length > 0) {
        sqlDump += `-- Data for table ${tableName}\n`;
        
        // Get the actual column names from the first row to ensure we have the right columns
        const actualColumns = Object.keys(dataRes.rows[0]);
        
        // Validate that we don't have system columns
        if (hasSystemColumns(columnNames)) {
          console.warn(`Skipping table ${tableName} - detected system columns:`, columnNames);
          continue;
        }
        
        for (const rowData of dataRes.rows) {
          const columns = actualColumns
            .map((col) => `"${col}"`)
            .join(", ");
          const values = actualColumns
            .map((col) => formatValue(rowData[col]))
            .join(", ");
          sqlDump += `INSERT INTO "${tableName}" (${columns}) VALUES (${values});\n`;
        }
        sqlDump += "\n";
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

// Export specific table data
app.post('/backup/export-table', async (req, res) => {
    const { connectionString, tableName } = req.body;
    
    if (!connectionString) {
        return res.status(400).send('Connection string is required');
    }
    
    if (!tableName) {
        return res.status(400).send('Table name is required');
    }

    const pool = new Pool({ connectionString });

    try {
        const client = await pool.connect();
        
        // Verify table exists in public schema
        const tableExists = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
            AND table_type = 'BASE TABLE'
        `, [tableName]);
        
        if (tableExists.rows.length === 0) {
            return res.status(404).send(`Table '${tableName}' not found in public schema`);
        }

        // Get table structure
        const columnsRes = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        `, [tableName]);

        if (columnsRes.rows.length === 0) {
            return res.status(404).send(`No columns found for table '${tableName}'`);
        }

        // Validate that we don't have system columns
        const columnNames = columnsRes.rows.map(col => col.column_name);
        if (hasSystemColumns(columnNames)) {
            return res.status(400).send(`Table '${tableName}' contains system columns and cannot be exported safely. Columns: [${columnNames.join(', ')}]`);
        }

        // Build CREATE TABLE statement
        let sqlDump = `-- Table: ${tableName}\n`;
        sqlDump += `CREATE TABLE "${tableName}" (\n`;

        const columnDefs = columnsRes.rows.map((col) => {
            const nullability = col.is_nullable === "NO" ? "NOT NULL" : "";
            return `  "${col.column_name}" ${col.data_type} ${nullability}`.trim();
        });

        sqlDump += columnDefs.join(",\n") + "\n);\n\n";

        // Get column names for data query
        const columnNamesForData = columnsRes.rows.map(col => col.column_name);
        const columnList = columnNamesForData.map(col => `"${col}"`).join(', ');

        // Get table data with proper error handling
        let dataRes;
        try {
            console.log(`Querying table ${tableName} with columns: ${columnList}`);
            dataRes = await client.query(`SELECT ${columnList} FROM public."${tableName}";`);
            console.log(`Query returned ${dataRes.rows.length} rows`);
            
            // Debug: Log the first row structure
            if (dataRes.rows.length > 0) {
                console.log(`First row keys: [${Object.keys(dataRes.rows[0]).join(', ')}]`);
                console.log(`First row values:`, JSON.stringify(dataRes.rows[0], null, 2));
                
                // Check if we have any suspicious values in the first row
                for (const [key, value] of Object.entries(dataRes.rows[0])) {
                    if (value && typeof value === 'string' && value.includes('pg_')) {
                        console.warn(`Suspicious value found in column ${key}: ${value}`);
                    }
                }
            }
        } catch (queryError) {
            return res.status(500).send(`Error querying table data: ${queryError.message}. This table may contain system data that cannot be exported.`);
        }
        
        if (dataRes.rows.length > 0) {
            sqlDump += `-- Data for table ${tableName}\n`;
            
            // Validate the first row to ensure we have proper data
            const firstRow = dataRes.rows[0];
            const actualColumns = Object.keys(firstRow);
            
            // Check if the actual columns match our expected columns
            const columnMismatch = actualColumns.some(col => 
                !columnNamesForData.includes(col) || 
                (col.startsWith('pg_') && col.includes('_') && 
                 (col.includes('foreign') || col.includes('server') || col.includes('wrapper') ||
                  col.includes('index') || col.includes('constraint') || col.includes('mapping') ||
                  col.includes('proc') || col.includes('oid') || col.includes('toast') || col.includes('stat')))
            );
            
            if (columnMismatch) {
                console.error(`Column mismatch detected for table ${tableName}:`);
                console.error(`Expected: [${columnNamesForData.join(', ')}]`);
                console.error(`Actual: [${actualColumns.join(', ')}]`);
                
                // Try a fallback approach - query without column names
                console.log(`Trying fallback query for table ${tableName}...`);
                try {
                    const fallbackRes = await client.query(`SELECT * FROM public."${tableName}" LIMIT 1;`);
                    console.log(`Fallback query keys: [${Object.keys(fallbackRes.rows[0] || {}).join(', ')}]`);
                    console.log(`Fallback query values:`, JSON.stringify(fallbackRes.rows[0] || {}, null, 2));
                } catch (fallbackError) {
                    console.error(`Fallback query also failed:`, fallbackError.message);
                }
                
                return res.status(400).send(`Table '${tableName}' contains system data or column mismatch. Expected columns: [${columnNamesForData.join(', ')}], but got: [${actualColumns.join(', ')}]`);
            }
            
            // Use the column names from information_schema, not from the actual data
            for (const rowData of dataRes.rows) {
                const columns = columnNamesForData
                    .map((col) => `"${col}"`)
                    .join(", ");
                const values = columnNamesForData
                    .map((col) => {
                        const value = rowData[col];
                        const formatted = formatValue(value);
                        // Debug: Log if we're getting unexpected values
                        if (value && typeof value === 'string' && value.includes('pg_')) {
                            console.log(`Column ${col} has suspicious value: ${value} -> ${formatted}`);
                        }
                        return formatted;
                    })
                    .join(", ");
                sqlDump += `INSERT INTO "${tableName}" (${columns}) VALUES (${values});\n`;
            }
            sqlDump += "\n";
        }

        client.release();

        // Create temporary file and send as download
        const filePath = path.join(__dirname, `${tableName}_backup.sql`);
        fs.writeFileSync(filePath, sqlDump);

        res.download(filePath, `${tableName}_backup.sql`, (err) => {
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

// Copy table data from one database to another
app.post('/backup/copy-table', async (req, res) => {
    const { sourceConnectionString, targetConnectionString, tableName } = req.body;
    
    if (!sourceConnectionString) {
        return res.status(400).send('Source connection string is required');
    }
    
    if (!targetConnectionString) {
        return res.status(400).send('Target connection string is required');
    }
    
    if (!tableName) {
        return res.status(400).send('Table name is required');
    }

    const sourcePool = new Pool({ connectionString: sourceConnectionString });
    const targetPool = new Pool({ connectionString: targetConnectionString });

    try {
        const sourceClient = await sourcePool.connect();
        const targetClient = await targetPool.connect();
        
        // Verify table exists in source database
        const sourceTableExists = await sourceClient.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
            AND table_type = 'BASE TABLE'
        `, [tableName]);
        
        if (sourceTableExists.rows.length === 0) {
            return res.status(404).send(`Table '${tableName}' not found in source database`);
        }

        // Verify table exists in target database
        const targetTableExists = await targetClient.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
            AND table_type = 'BASE TABLE'
        `, [tableName]);
        
        if (targetTableExists.rows.length === 0) {
            return res.status(404).send(`Table '${tableName}' not found in target database`);
        }

        // Get table structure from source
        const sourceColumnsRes = await sourceClient.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        `, [tableName]);

        if (sourceColumnsRes.rows.length === 0) {
            return res.status(404).send(`No columns found for table '${tableName}' in source database`);
        }

        // Validate that we don't have system columns
        const columnNames = sourceColumnsRes.rows.map(col => col.column_name);
        if (hasSystemColumns(columnNames)) {
            return res.status(400).send(`Table '${tableName}' contains system columns and cannot be exported safely. Columns: [${columnNames.join(', ')}]`);
        }

        // Get column names for data query
        const columnNamesForData = sourceColumnsRes.rows.map(col => col.column_name);
        const columnList = columnNamesForData.map(col => `"${col}"`).join(', ');

        // Get table data from source
        let sourceDataRes;
        try {
            console.log(`Querying source table ${tableName} with columns: ${columnList}`);
            sourceDataRes = await sourceClient.query(`SELECT ${columnList} FROM public."${tableName}";`);
            console.log(`Source query returned ${sourceDataRes.rows.length} rows`);
        } catch (queryError) {
            return res.status(500).send(`Error querying source table data: ${queryError.message}. This table may contain system data that cannot be exported.`);
        }

        if (sourceDataRes.rows.length === 0) {
            return res.status(200).send(`Table '${tableName}' is empty. No data to copy.`);
        }

        // Begin transaction on target database
        await targetClient.query('BEGIN');

        try {
            // Clear existing data from target table (optional - you can remove this if you want to append)
            await targetClient.query(`DELETE FROM public."${tableName}";`);
            
            // Prepare the INSERT statement
            const columns = columnNamesForData.map((col) => `"${col}"`).join(", ");
            const placeholders = columnNamesForData.map((_, index) => `$${index + 1}`).join(", ");
            const insertQuery = `INSERT INTO public."${tableName}" (${columns}) VALUES (${placeholders})`;

            // Insert data row by row
            let insertedRows = 0;
            for (const rowData of sourceDataRes.rows) {
                const values = columnNamesForData.map(col => {
                    const value = rowData[col];
                    // Handle null values properly
                    if (value === null || value === undefined) {
                        return null;
                    }
                    return value;
                });
                console.log("values", values);
                console.log("insertQuery", insertQuery);
                await targetClient.query(insertQuery, values);
                insertedRows++;
            }

            // Commit the transaction
            await targetClient.query('COMMIT');

            res.json({
                success: true,
                message: `Successfully copied ${insertedRows} rows from table '${tableName}'`,
                sourceRows: sourceDataRes.rows.length,
                targetRows: insertedRows
            });

        } catch (insertError) {
            // Rollback on error
            await targetClient.query('ROLLBACK');
            throw insertError;
        }

    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    } finally {
        sourceClient?.release();
        targetClient?.release();
        await sourcePool.end();
        await targetPool.end();
    }
});

const upload = multer({ dest: 'uploads/' });

// Import a .sql file into the database
app.post('/backup/import', (req, res) => {
    const connectionString = req.body.connectionString;
    if (!connectionString) {
      return res.status(400).send("Connection string is not set");
    }

    const sqlCommands = `

CREATE TABLE "blog_keywords" (
"blog_keyword_id" integer,
"blog_id" integer,
"keyword_id" integer,
"is_primary" boolean,
"created_at" timestamp without time zone
);

-- blog_keywords
ALTER TABLE blog_keywords
ALTER COLUMN blog_keyword_id SET NOT NULL,
ALTER COLUMN blog_keyword_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- top_ranking_blogs
ALTER TABLE top_ranking_blogs
ALTER COLUMN top_blog_id SET NOT NULL,
ALTER COLUMN top_blog_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- keywords
ALTER TABLE keywords
ALTER COLUMN keyword_id SET NOT NULL,
ALTER COLUMN keyword_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- blog_revisions
ALTER TABLE blog_revisions
ALTER COLUMN revision_id SET NOT NULL,
ALTER COLUMN revision_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- blog_analytics
ALTER TABLE blog_analytics
ALTER COLUMN analytics_id SET NOT NULL,
ALTER COLUMN analytics_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- ai_logs
ALTER TABLE ai_logs
ALTER COLUMN ai_log_id SET NOT NULL,
ALTER COLUMN ai_log_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- blog_validations
ALTER TABLE blog_validations
ALTER COLUMN validation_id SET NOT NULL,
ALTER COLUMN validation_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- cms_publish_logs
ALTER TABLE cms_publish_logs
ALTER COLUMN publish_id SET NOT NULL,
ALTER COLUMN publish_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- blog_faqs
ALTER TABLE blog_faqs
ALTER COLUMN faq_id SET NOT NULL,
ALTER COLUMN faq_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- shopify_products
ALTER TABLE shopify_products
ALTER COLUMN id SET NOT NULL,
ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;

-- companies
ALTER TABLE companies
ALTER COLUMN company_id SET NOT NULL,
ALTER COLUMN company_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- seo_data
ALTER TABLE seo_data
ALTER COLUMN seo_data_id SET NOT NULL,
ALTER COLUMN seo_data_id ADD GENERATED BY DEFAULT AS IDENTITY;

-- genreted_keywords
ALTER TABLE genreted_keywords
ALTER COLUMN id SET NOT NULL,
ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;

`;

    const pool = new Pool({ connectionString });

    pool.query(sqlCommands, (error) => {
        
        if (error) {
            return res.status(500).send(`Error: ${error.message}`);
        }
        res.send('Database imported successfully');
    });
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
