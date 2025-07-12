const { Pool } = require('pg');

async function debugTable(connectionString, tableName) {
    const pool = new Pool({ connectionString });
    
    try {
        const client = await pool.connect();
        
        console.log(`\n=== Debugging table: ${tableName} ===\n`);
        
        // 1. Check table structure
        console.log('1. Table structure:');
        const structureRes = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        `, [tableName]);
        
        console.log('Columns:');
        structureRes.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
        });
        
        // 2. Try different query approaches
        console.log('\n2. Testing different query approaches:');
        
        // Approach 1: SELECT with specific columns
        const columnNames = structureRes.rows.map(col => col.column_name);
        const columnList = columnNames.map(col => `"${col}"`).join(', ');
        
        console.log(`\nApproach 1: SELECT ${columnList}`);
        try {
            const res1 = await client.query(`SELECT ${columnList} FROM public."${tableName}" LIMIT 3;`);
            console.log(`Result: ${res1.rows.length} rows`);
            if (res1.rows.length > 0) {
                console.log('First row keys:', Object.keys(res1.rows[0]));
                console.log('First row values:', JSON.stringify(res1.rows[0], null, 2));
            }
        } catch (error) {
            console.error('Error:', error.message);
        }
        
        // Approach 2: SELECT *
        console.log(`\nApproach 2: SELECT *`);
        try {
            const res2 = await client.query(`SELECT * FROM public."${tableName}" LIMIT 3;`);
            console.log(`Result: ${res2.rows.length} rows`);
            if (res2.rows.length > 0) {
                console.log('First row keys:', Object.keys(res2.rows[0]));
                console.log('First row values:', JSON.stringify(res2.rows[0], null, 2));
            }
        } catch (error) {
            console.error('Error:', error.message);
        }
        
        // Approach 3: Check for any suspicious data
        console.log(`\nApproach 3: Looking for suspicious data`);
        try {
            const res3 = await client.query(`SELECT * FROM public."${tableName}" LIMIT 10;`);
            for (let i = 0; i < Math.min(res3.rows.length, 3); i++) {
                const row = res3.rows[i];
                console.log(`\nRow ${i + 1}:`);
                for (const [key, value] of Object.entries(row)) {
                    if (value && typeof value === 'string' && value.includes('pg_')) {
                        console.log(`  SUSPICIOUS: ${key} = ${value}`);
                    } else {
                        console.log(`  ${key} = ${value}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error:', error.message);
        }
        
        client.release();
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

// Usage example:
// node debug_table.js "postgresql://user:pass@host:port/db" "spin_count"

if (process.argv.length >= 4) {
    const connectionString = process.argv[2];
    const tableName = process.argv[3];
    debugTable(connectionString, tableName);
} else {
    console.log('Usage: node debug_table.js <connection_string> <table_name>');
    console.log('Example: node debug_table.js "postgresql://user:pass@host:port/db" "spin_count"');
} 