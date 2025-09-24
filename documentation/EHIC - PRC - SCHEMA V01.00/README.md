# PRC Signature Profile

TODO: estimate the signature size for

- RSA (2k, 4k keys)
- EC

From this we get the largest QR Code payload as content elements are limited

To determine what is the biggest QR code we can expect and if that size/density are acceptable?

Example credential

```json
{
  "header": {
    "alg": "ES256",
    "kid": "eessi:jkt:{jwk thumbprint of the public key}"
  },
  "payload": {
    "sid": "eessi:prc:1.0",
    "jti": "unique-token-12345",
    "rid": "https://example.org/revocation/123",
    "prc": {
      "ic": "BE",
      "fn": "Wonderland",
      "gn": "Alice",
      "dob": "1984-07-20",
      "hi": "84072002127",
      "in": "CM",
      "ii": "0120",
      "ci": "01200000001234567890",
      "sd": "2025-01-01",
      "ed": "2025-12-31",
      "xd": "2025-12-31",
      "di": "2025-03-12"
    }
  }
}
```

Identifiers from the VC:

- kid: key identifier
- sid: schema identifier
- rid: revocation list identifier
- issuer: ic (card issuer country) + ii (institution identification number)
