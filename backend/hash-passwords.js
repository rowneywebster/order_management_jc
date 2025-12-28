const bcrypt = require('bcrypt');

async function hashPasswords() {
    const adminPassword = 'T7@wLz#3Qk9';
    const userPassword = 'Laare2030';
    
    const adminHash = await bcrypt.hash(adminPassword, 10);
    const userHash = await bcrypt.hash(userPassword, 10);
    
    console.log('Admin password hash:');
    console.log(adminHash);
    console.log('\nUser password hash:');
    console.log(userHash);
    
    console.log('\n\nComplete SQL:');
    console.log(`INSERT INTO users (email, password, role) VALUES`);
    console.log(`('cargojoyful@gmail.com', '${adminHash}', 'admin'),`);
    console.log(`('truphenamukiri@gmail.com', '${userHash}', 'user')`);
    console.log(`ON CONFLICT (email) DO NOTHING;`);
}

hashPasswords();
