# Export of EHIC PRC data to the Healthcare provider. 
This document describes the different ways in which the data from the verification could be exported to the healthcare provider. 

Important on the content of the data is the evidence on which the verification is based. 
the time and date of the verification. 
the results of the verification steps
the conclusion
the format in which this information is delivered. 
the way trust is asserted on this document. 

the information in the POC for the demo will be initially delivered as a signed PDF according to the specification below. it can also be envisioned to create a signed JWT as evidence, however this will require that during the reimbursement part of the process the administrative staff of the healthcare provider also has required tooling to validate such a document, if this is desirable will need to be seen, and can be implemented at a later stage.



## Evidence required for verification.
1. data in the QR code
- The verification will have as input the QR-code which is scanned by the verifier
2. data of the identity of the holder
- The agreement that the identification documentation reflects the same identity as the identity packed in the data structure of the QR-code
3. the identity of the issuer used at time of verification. 
- The verified identity of the issuer on the trust registries at time of verification. 
4. verification elements concerning the verification itself which falls into 
-  technical validation
- business rule validation


## result of the verification steps. 
the verification steps that are executed as part of the verification are: 


## Technical validation steps :  
1. a correct base 45 encoded string 
2. a correct compressed data (according to zlib)
3. a correct JWT format
4. check if the schema identified in the JWT is available.
5. a schema valid content
6. retrieve the 1. signature from the trust registries based on : 
7a : thumbprint
7b : countrycode
7c : officialId
8. if this results in more than 1 signature should result in an error.
9 : if returned result in data not having the same country id or official id an error should be given. 


a correct signature in relation to the trust registries.

## Business validation steps
1. invalid if : treatment date is > current date 
2. if no date is present consider treatment date to be equal to verification date. 
3. the signature should be valid and not expired or inactive.
4. the payload of the retrieved in formation should reflect that the issuer is allowed to issue an EHIC
5. the period of issued EHIC should fall in the validity period of the accreditation of the EHIC 
6. start date EHIC should be before or equal to the end date of the validity of the EHIC
7. start date EHIC should be after or equal to the date of birth of the holder.
8. issuance date should be bigger or the same as start date.
9. end date should be lagers or the same as data of issuance.
10. incase of an expiration date, this must be greater or the same as end date.
11. issuing institution must not exceed 25 characters.
12. the ci. must only contain digits.
13. first name should be the same as manually checked on the shown identity document. 
14. last name should be the same as manually checked on the shown identity document.
15. date of birth should be the same as manually checked on the shown identity document.

Regardless on result evidence of the PRC must be produced indicating the results of all the steps: 







