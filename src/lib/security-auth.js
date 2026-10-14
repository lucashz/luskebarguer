const DUMMY_PASSWORD_HASH = 'pbkdf2_sha256$310000$00000000000000000000000000000000$63a7eb496dbeddf3e6d40edcab0aa0f2df64e348dc15de15dbe5ad7cebb95ee0';

export function invalidCredentialError(httpError) {
  return httpError(401, 'E-mail ou senha inválidos.');
}

export function passwordHashForVerification(account) {
  return account?.password_hash || DUMMY_PASSWORD_HASH;
}
