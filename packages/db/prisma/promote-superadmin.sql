-- Promote registered user to SUPER_ADMIN role + verify email.
UPDATE "user" SET role='SUPER_ADMIN', "emailVerified"=NOW() WHERE email='yourstart.com.ua@gmail.com';
