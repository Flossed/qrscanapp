/* Using : https://phrase.com/blog/posts/step-step-guide-javascript-localization/
   adapted a bit to have sessions in order to keep context of language over pages.
*/

const languageSelector                 = document.getElementById( 'languageSelector' );
const defaultLocale                    = 'en';
let locale                             = defaultLocale;
let fetchedTranslations             = {};

languageSelector.addEventListener( 'change', setTheLanguage );
document.addEventListener( 'DOMContentLoaded', () => { setLocale( defaultLocale ); } );

function setTheLanguage ()
{   sessionStorage.setItem( 'usedLanguage',languageSelector.value );
    setLocale( languageSelector.value );
    const currentUrl               = window.location.href;
    window.location.href           = currentUrl;
}

function updateLangeSelector ()
{   languageSelector.value             = locale;
}

async function setLocale ( newLocale )
{   let   tempLocale;
    try
    {    tempLocale                    =   sessionStorage.getItem( 'usedLanguage' );
         locale                        = ( tempLocale === null ) ? newLocale : tempLocale;
         sessionStorage.setItem( 'usedLanguage',locale );
         fetchedTranslations           =   await fetchTranslationsFor( locale );
         sessionStorage.setItem( 'actualTranslations',JSON.stringify( fetchedTranslations ) );
         updateLangeSelector();
         translatePage();
         //translateLabels();
   }
   catch ( ex )
   {   console.log( 'Exception:',ex );
   }
}



async function fetchTranslationsFor ( newLocale )
{   const response                     = await fetch( `/lang/${newLocale}.json` );
    return await response.json();
}



function translatePage ()
{   document
    .querySelectorAll( '[data-i18n-key]' )
    .forEach( translateElement );
}



function translateElement ( element )
{   const key                          =   element.getAttribute( 'data-i18n-key' );
    const translation                  =   fetchedTranslations[key];
    element.innerText                  =   translation;
}

function getTranslatedElement ( key )
{  const tempLocale                    =   sessionStorage.getItem( 'actualTranslations' );
   const tempLocaleObj                 =   JSON.parse( tempLocale );
   return tempLocaleObj[key];
}



function translateLabels ()
{   const userEmail                    =   document.getElementById( 'userCredential' );
    const userPassword                 =   document.getElementById( 'userPassword' );    
    userEmail.placeholder              =   getTranslatedElement ( 'login-label-email-example' );
    userPassword.placeholder           =   getTranslatedElement ( 'login-label-password-example' );
}
