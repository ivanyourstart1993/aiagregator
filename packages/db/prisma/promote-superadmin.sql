UPDATE "user" SET role='SUPER_ADMIN', "emailVerified"=NOW() WHERE email='yourstart.com.ua@gmail.com';
SELECT id, email, role, "emailVerified" FROM "user" WHERE email='yourstart.com.ua@gmail.com';
