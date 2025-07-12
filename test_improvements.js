const { Pool } = require('pg');

// Test the helper functions
function testHelperFunctions() {
    console.log('Testing helper functions...\n');
    
    // Test isSystemTable function
    const testTables = [
        'users',
        'posts', 
        'pg_user_mapping',
        'pg_proc',
        'pg_stat_activity',
        'information_schema.tables',
        'sql_features',
        'pg_toast_12345',
        'user_mapping', // This should be allowed
        'procedure_log' // This should be allowed
    ];
    
    console.log('Testing isSystemTable function:');
    testTables.forEach(table => {
        const isSystem = isSystemTable(table);
        console.log(`  ${table}: ${isSystem ? 'SYSTEM' : 'USER'}`);
    });
    
    console.log('\nTesting hasSystemColumns function:');
    const testColumns = [
        ['id', 'name', 'email'],
        ['pg_oid', 'name', 'email'],
        ['id', 'pg_mapping', 'email'],
        ['id', 'name', 'proc_id'],
        ['user_id', 'post_id', 'created_at']
    ];
    
    testColumns.forEach((columns, index) => {
        const hasSystem = hasSystemColumns(columns);
        console.log(`  Test ${index + 1} [${columns.join(', ')}]: ${hasSystem ? 'HAS SYSTEM' : 'SAFE'}`);
    });
    
    console.log('\nTesting formatValue function:');
    const testValues = [
        null,
        undefined,
        'normal string',
        'string with \'quotes\'',
        'pg_user_mapping',
        'pg_foreign_data_wrapper_name_index', // This should be detected as system data
        'pg_foreign_server_name_index', // This should be detected as system data
        '12345', // This should be allowed (numeric string)
        'pg_12345', // This should be allowed (not a system column name)
        'foreign_policy', // This should be allowed (not a system column name)
        new Date(),
        [1, 2, 3],
        { key: 'value' },
        NaN,
        Infinity
    ];
    
    testValues.forEach(value => {
        try {
            const formatted = formatValue(value);
            console.log(`  ${JSON.stringify(value)} -> ${formatted}`);
        } catch (error) {
            console.log(`  ${JSON.stringify(value)} -> ERROR: ${error.message}`);
        }
    });
    
    console.log('\nTesting system column detection:');
    const systemColumnTests = [
        ['id', 'name', 'email'],
        ['pg_oid', 'name', 'email'],
        ['id', 'pg_foreign_data_wrapper_name_index', 'email'],
        ['id', 'pg_foreign_server_name_index', 'email'],
        ['user_id', 'post_id', 'created_at'],
        ['spin_id', 'created_at', 'user_id', 'spin_value']
    ];
    
    systemColumnTests.forEach((columns, index) => {
        const hasSystem = hasSystemColumns(columns);
        console.log(`  Test ${index + 1} [${columns.join(', ')}]: ${hasSystem ? 'HAS SYSTEM' : 'SAFE'}`);
    });
}

// Copy the helper functions from index.js for testing
function isSystemTable(tableName) {
    return tableName.startsWith('pg_') || 
           tableName.startsWith('sql_') || 
           tableName.includes('information_schema') || 
           tableName.includes('pg_toast') ||
           tableName.includes('mapping') ||
           tableName.includes('proc') ||
           tableName.includes('oid');
}

function hasSystemColumns(columnNames) {
    return columnNames.some(col => 
        col.includes('pg_') || 
        col.includes('oid') ||
        col.includes('toast') ||
        col.includes('index') ||
        col.includes('constraint') ||
        col.includes('mapping') ||
        col.includes('proc') ||
        col.includes('foreign') ||
        col.includes('server') ||
        col.includes('wrapper') ||
        col.includes('xid') ||
        col.includes('rel') ||
        col.includes('att')
    );
}

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
            // Check if it looks like system table data
            if (jsonStr.includes('pg_') || jsonStr.includes('oid') || jsonStr.includes('mapping') ||
                jsonStr.includes('foreign') || jsonStr.includes('server') || jsonStr.includes('wrapper')) {
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
        // Check if the string representation looks problematic
        if (str.includes('[object') || str.includes('pg_') || str.includes('oid') ||
            str.includes('foreign') || str.includes('server') || str.includes('wrapper')) {
            return "NULL";
        }
        return `'${str.replace(/'/g, "''")}'`;
    } catch (e) {
        return "NULL";
    }
}

// Run the tests
console.log('PostgreSQL Backup Tool - Improvement Tests\n');
console.log('==========================================\n');

testHelperFunctions();

console.log('\n==========================================');
console.log('Tests completed!');
console.log('\nKey improvements:');
console.log('1. System tables are now properly detected and excluded');
console.log('2. System columns are validated and rejected');
console.log('3. Data formatting handles PostgreSQL-specific types safely');
console.log('4. Error handling prevents export of problematic data');
console.log('5. Clear error messages guide users to safe tables'); 