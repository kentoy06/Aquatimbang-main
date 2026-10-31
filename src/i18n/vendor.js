// AquaTimbang - language switcher for the Fish Vendor dashboard.
// English text is the key; Filipino and Cebuano translations are below.
// Text without a translation is shown in English.

import { createContext, useContext, useState } from "react";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fil", label: "Filipino" },
  { code: "ceb", label: "Cebuano (Bisaya)" },
];

const STORAGE_KEY = "vendorLanguage";

// [Filipino, Cebuano]
const PHRASES = {
  // Sidebar and header
  "PRICES": ["PRESYO", "PRESYO"],
  "SUGGESTIONS": ["MUNGKAHI", "SUGYOT"],
  "TOOLS": ["KASANGKAPAN", "GAMIT"],
  "ACCOUNT": ["ACCOUNT", "ACCOUNT"],
  "FISH VENDOR": ["TINDERO NG ISDA", "TINDERO SA ISDA"],
  "Fish Vendor": ["Tindero ng Isda", "Tindero sa Isda"],
  "Dashboard": ["Dashboard", "Dashboard"],
  "Current Fish Prices": ["Kasalukuyang Presyo ng Isda", "Presyo sa Isda Karon"],
  "Price Trends": ["Takbo ng Presyo", "Dagan sa Presyo"],
  "Price Forecast": ["Pagtataya ng Presyo", "Tagna sa Presyo"],
  "Submit Suggested Price": ["Magmungkahi ng Presyo", "Mosugyot og Presyo"],
  "My Suggested Prices": ["Aking mga Mungkahing Presyo", "Akong mga Gisugyot nga Presyo"],
  "Community Average": ["Karaniwang Presyo ng Komunidad", "Kasagaran nga Presyo sa Komunidad"],
  "Fair Price Calculator": ["Calculator ng Patas na Presyo", "Calculator sa Patas nga Presyo"],
  "Export Reports": ["I-export ang Ulat", "I-export ang Report"],
  "Notifications": ["Mga Abiso", "Mga Pahibalo"],
  "My Profile": ["Aking Profile", "Akong Profile"],
  "Help / How to Use": ["Tulong / Paano Gamitin", "Tabang / Unsaon Paggamit"],
  "↪ Logout": ["↪ Mag-logout", "↪ Mo-logout"],
  "Language": ["Wika", "Pinulongan"],
  "View official fish prices and compute fair selling amounts": [
    "Tingnan ang opisyal na presyo ng isda at kuwentahin ang patas na halaga ng benta",
    "Tan-awa ang opisyal nga presyo sa isda ug kuwentaha ang patas nga kantidad sa baligya",
  ],

  // Dashboard
  "Welcome, {name}!": ["Maligayang pagdating, {name}!", "Maayong pag-abot, {name}!"],
  "Official LGU prices for {place}.": ["Opisyal na presyo ng LGU para sa {place}.", "Opisyal nga presyo sa LGU para sa {place}."],
  "all municipalities": ["lahat ng munisipyo", "tanang munisipyo"],
  "My Fish Today": ["Aking mga Isda Ngayon", "Akong mga Isda Karon"],
  "Latest official prices of the fish you sell. Tap a fish to see its photo.": [
    "Pinakabagong opisyal na presyo ng mga isdang tinda mo. Pindutin ang isda para makita ang larawan nito.",
    "Pinakabag-ong opisyal nga presyo sa mga isda nga imong gibaligya. Pindota ang isda aron makita ang hulagway niini.",
  ],
  "No published price yet": ["Wala pang opisyal na presyo", "Wala pay opisyal nga presyo"],
  "You have not chosen the fish you sell. Add them in My Profile.": [
    "Hindi mo pa napipili ang mga isdang tinda mo. Idagdag ito sa Aking Profile.",
    "Wala pa nimo mapili ang mga isda nga imong gibaligya. Idugang kini sa Akong Profile.",
  ],
  "Choose My Fish": ["Piliin ang Aking Isda", "Pilia ang Akong Isda"],
  "Published Species": ["Mga Isdang may Presyo", "Mga Isda nga may Presyo"],
  "Average Published Price / KG": ["Karaniwang Presyo / KG", "Kasagaran nga Presyo / KG"],
  "My Pending Suggestions": ["Aking Nakabinbing Mungkahi", "Akong mga Sugyot nga Naghulat"],
  "Latest Official Fish Prices": ["Pinakabagong Opisyal na Presyo ng Isda", "Pinakabag-ong Opisyal nga Presyo sa Isda"],
  "Only LGU-published records": ["Mga presyong inilathala lamang ng LGU", "Mga presyo nga gipatik lang sa LGU"],
  "View All Prices": ["Tingnan Lahat ng Presyo", "Tan-awa Tanang Presyo"],
  "SPECIES": ["ISDA", "ISDA"],
  "PRICE / KG": ["PRESYO / KG", "PRESYO / KG"],
  "AS OF": ["PETSA", "PETSA"],
  "Your fish": ["Tinda mo", "Imong baligya"],

  // Current prices and municipality picker
  "Latest official LGU prices. Tap a fish to see its photo.": [
    "Pinakabagong opisyal na presyo ng LGU. Pindutin ang isda para makita ang larawan nito.",
    "Pinakabag-ong opisyal nga presyo sa LGU. Pindota ang isda aron makita ang hulagway niini.",
  ],
  "FISH SPECIES": ["URI NG ISDA", "MATANG SA ISDA"],
  "MUNICIPALITY": ["MUNISIPYO", "MUNISIPYO"],
  "OFFICIAL PRICE / KG": ["OPISYAL NA PRESYO / KG", "OPISYAL NGA PRESYO / KG"],
  "RECORDED DATE": ["PETSA NG TALA", "PETSA SA REKORD"],
  "STATUS": ["ESTADO", "KAHIMTANG"],
  "Published": ["Nailathala", "Gipatik"],
  "Municipality:": ["Munisipyo:", "Munisipyo:"],
  "All municipalities": ["Lahat ng munisipyo", "Tanang munisipyo"],
  "Municipalities remain selectable even when they have no published prices.": [
    "Mapipili pa rin ang munisipyo kahit wala pang presyo.",
    "Mapili gihapon ang munisipyo bisan wala pay presyo.",
  ],
  "Loading published prices…": ["Kinukuha ang mga presyo…", "Gikuha ang mga presyo…"],
  "Could not load official prices: {error}": ["Hindi makuha ang opisyal na presyo: {error}", "Dili makuha ang opisyal nga presyo: {error}"],
  "No published LGU prices are available yet.": ["Wala pang opisyal na presyo ng LGU.", "Wala pay opisyal nga presyo sa LGU."],

  // Fish details window
  "Fish Details": ["Detalye ng Isda", "Detalye sa Isda"],
  "Scientific name": ["Siyentipikong pangalan", "Siyentipikong ngalan"],
  "Latest official price": ["Pinakabagong opisyal na presyo", "Pinakabag-ong opisyal nga presyo"],
  "No description yet.": ["Wala pang paglalarawan.", "Wala pay paghulagway."],
  "No photo of this fish yet.": ["Wala pang larawan ang isdang ito.", "Wala pay hulagway kini nga isda."],
  "Close": ["Isara", "Sirado"],
  "Compute Price": ["Kuwentahin ang Presyo", "Kuwentaha ang Presyo"],

  // Fair price calculator
  "Calculate a reference amount using the latest published LGU fish price.": [
    "Kuwentahin ang halaga gamit ang pinakabagong opisyal na presyo ng LGU.",
    "Kuwentaha ang kantidad gamit ang pinakabag-ong opisyal nga presyo sa LGU.",
  ],
  "Reference calculation only": ["Para sa sanggunian lamang", "Para pakisayran lang"],
  "The amount is based on the latest published LGU price for the selected municipality. Actual transactions may differ.": [
    "Ang halaga ay batay sa pinakabagong opisyal na presyo ng LGU sa napiling munisipyo. Maaaring iba ang aktuwal na bentahan.",
    "Ang kantidad gibase sa pinakabag-ong opisyal nga presyo sa LGU sa napili nga munisipyo. Mahimong lahi ang tinuod nga baligyaay.",
  ],
  "Select a specific municipality to calculate a price.": [
    "Pumili ng isang munisipyo para makakuwenta ng presyo.",
    "Pagpili og usa ka munisipyo aron makakuwenta og presyo.",
  ],
  "Compute Reference Amount": ["Kuwentahin ang Halaga", "Kuwentaha ang Kantidad"],
  "Weight × latest published price per kilogram": ["Timbang × pinakabagong presyo kada kilo", "Timbang × pinakabag-ong presyo matag kilo"],
  "Fish Species": ["Uri ng Isda", "Matang sa Isda"],
  "Weight in Kilograms": ["Timbang sa Kilo", "Timbang sa Kilo"],
  "Please enter a weight greater than zero.": ["Maglagay ng timbang na higit sa zero.", "Pagbutang og timbang nga labaw sa zero."],
  "Latest Published LGU Price per KG": ["Pinakabagong Presyo ng LGU kada KG", "Pinakabag-ong Presyo sa LGU matag KG"],
  "Not available": ["Wala pa", "Wala pa"],
  "No published price for {fish} in {place}. Try another species or municipality.": [
    "Walang opisyal na presyo ang {fish} sa {place}. Subukan ang ibang isda o munisipyo.",
    "Walay opisyal nga presyo ang {fish} sa {place}. Sulayi ang laing isda o munisipyo.",
  ],
  "Computation Result": ["Resulta", "Resulta"],
  "Reference amount for the selected weight": ["Halaga para sa napiling timbang", "Kantidad para sa napili nga timbang"],
  "REFERENCE AMOUNT": ["HALAGA", "KANTIDAD"],
  "Select a published price and enter a valid weight": ["Pumili ng isda at maglagay ng tamang timbang", "Pagpili og isda ug pagbutang og saktong timbang"],
  "Clear": ["Burahin", "Papasa"],
  "Save to History": ["I-save sa Kasaysayan", "I-save sa Kasaysayan"],
  "Saving…": ["Sine-save…", "Gi-save…"],
  "My Saved Calculations": ["Aking mga Na-save na Kuwenta", "Akong mga Na-save nga Kuwenta"],
  "Saved calculations appear here, so you can look back at your pricing.": [
    "Dito makikita ang mga na-save mong kuwenta.",
    "Diri makita ang imong mga na-save nga kuwenta.",
  ],
  "Calculation saved to your history.": ["Na-save ang kuwenta.", "Na-save ang kuwenta."],

  // Suggested prices
  "Think the official price doesn't match what you're seeing at the market? Suggest a price for LGU review.": [
    "Hindi ba tugma ang opisyal na presyo sa nakikita mo sa palengke? Magmungkahi ng presyo para suriin ng LGU.",
    "Dili ba motakdo ang opisyal nga presyo sa imong makita sa merkado? Pagsugyot og presyo aron susihon sa LGU.",
  ],
  "New Suggestion": ["Bagong Mungkahi", "Bag-ong Sugyot"],
  "Submitted suggestions are reviewed by an LGU officer.": ["Sinusuri ng LGU officer ang bawat mungkahi.", "Gisusi sa LGU officer ang matag sugyot."],
  "Current Official Price": ["Kasalukuyang Opisyal na Presyo", "Opisyal nga Presyo Karon"],
  "LGU Validated": ["Beripikado ng LGU", "Gi-verify sa LGU"],
  "Your Suggested Price per KG": ["Iyong Mungkahing Presyo kada KG", "Imong Gisugyot nga Presyo matag KG"],
  "⚠ This is {pct}% above the current official price. Adding a comment helps the LGU officer understand why.": [
    "⚠ Ito ay {pct}% mas mataas sa opisyal na presyo. Makakatulong ang komento para maintindihan ng LGU officer kung bakit.",
    "⚠ Kini {pct}% mas taas sa opisyal nga presyo. Makatabang ang komento aron masabtan sa LGU officer ngano.",
  ],
  "⚠ This is {pct}% below the current official price. Adding a comment helps the LGU officer understand why.": [
    "⚠ Ito ay {pct}% mas mababa sa opisyal na presyo. Makakatulong ang komento para maintindihan ng LGU officer kung bakit.",
    "⚠ Kini {pct}% mas ubos sa opisyal nga presyo. Makatabang ang komento aron masabtan sa LGU officer ngano.",
  ],
  "Comment (optional)": ["Komento (opsyonal)", "Komento (opsyonal)"],
  "Explain the market conditions or price difference": [
    "Ipaliwanag ang kalagayan ng palengke o ang pagkakaiba ng presyo",
    "Ipasabot ang kahimtang sa merkado o ang kalainan sa presyo",
  ],
  "Your suggestion will be saved and forwarded to the LGU for review.": [
    "Ise-save ang iyong mungkahi at ipapasa sa LGU para suriin.",
    "I-save ang imong sugyot ug ipasa sa LGU aron susihon.",
  ],
  "Submit Suggestion": ["Ipasa ang Mungkahi", "Ipasa ang Sugyot"],
  "Submitting...": ["Ipinapasa...", "Gipasa..."],
  "Suggested price saved and submitted for LGU review.": [
    "Na-save at naipasa sa LGU ang iyong mungkahi.",
    "Na-save ug napasa sa LGU ang imong sugyot.",
  ],
  "Track the status of every price you've suggested to the LGU.": [
    "Subaybayan ang estado ng bawat presyong iminungkahi mo sa LGU.",
    "Sundan ang kahimtang sa matag presyo nga imong gisugyot sa LGU.",
  ],
  "DATE": ["PETSA", "PETSA"],
  "SUGGESTED PRICE": ["MUNGKAHING PRESYO", "GISUGYOT NGA PRESYO"],
  "COMMENT": ["KOMENTO", "KOMENTO"],
  "LGU FEEDBACK": ["TUGON NG LGU", "TUBAG SA LGU"],
  "ACTIONS": ["AKSYON", "AKSYON"],
  "You haven't submitted any suggestions yet.": ["Wala ka pang naipapasang mungkahi.", "Wala ka pay napasa nga sugyot."],

  // Notifications
  "Updates about your suggestions and today's official prices.": [
    "Mga balita tungkol sa iyong mungkahi at opisyal na presyo ngayon.",
    "Mga balita bahin sa imong sugyot ug opisyal nga presyo karon.",
  ],
  "You're all caught up.": ["Wala nang bagong abiso.", "Wala nay bag-ong pahibalo."],

  // Help page
  "A quick walkthrough of everything you can do in AquaTimbang.": [
    "Maikling gabay sa lahat ng magagawa mo sa AquaTimbang.",
    "Mubo nga giya sa tanan nimong mahimo sa AquaTimbang.",
  ],
  "Check today's prices": ["Tingnan ang presyo ngayon", "Tan-awa ang presyo karon"],
  "Open Current Fish Prices to see LGU-validated rates for every species before you head to the market.": [
    "Buksan ang Kasalukuyang Presyo ng Isda para makita ang opisyal na presyo bago ka pumunta sa palengke.",
    "Ablihi ang Presyo sa Isda Karon aron makita ang opisyal nga presyo sa dili pa ka moadto sa merkado.",
  ],
  "Compute a fair price": ["Kuwentahin ang patas na presyo", "Kuwentaha ang patas nga presyo"],
  "Use the Fair Price Calculator — enter the weight you're selling and it multiplies it by the official rate automatically.": [
    "Gamitin ang Calculator ng Patas na Presyo — ilagay ang timbang at kusa itong imu-multiply sa opisyal na presyo.",
    "Gamita ang Calculator sa Patas nga Presyo — ibutang ang timbang ug kusa kini nga i-multiply sa opisyal nga presyo.",
  ],
  "Suggest a correction": ["Magmungkahi ng pagwawasto", "Pagsugyot og pagtul-id"],
  "If a price looks off, go to Submit Suggested Price. Add a comment explaining why so the LGU officer has context.": [
    "Kung mukhang mali ang presyo, pumunta sa Magmungkahi ng Presyo at magdagdag ng komento kung bakit.",
    "Kung murag sayop ang presyo, adto sa Mosugyot og Presyo ug pagdugang og komento ngano.",
  ],
  "Track your suggestions": ["Subaybayan ang iyong mungkahi", "Sundan ang imong mga sugyot"],
  "My Suggested Prices shows the status of everything you've submitted, plus any feedback from the LGU officer.": [
    "Makikita sa Aking mga Mungkahing Presyo ang estado ng iyong mga ipinasa at ang tugon ng LGU officer.",
    "Makita sa Akong mga Gisugyot nga Presyo ang kahimtang sa imong gipasa ug ang tubag sa LGU officer.",
  ],
  "Compare with other vendors": ["Ihambing sa ibang tindero", "Itandi sa ubang tindero"],
  "Community Average shows what other fisherfolk are suggesting, so you can see if your numbers line up.": [
    "Ipinapakita ng Karaniwang Presyo ng Komunidad ang mungkahi ng ibang tindero.",
    "Gipakita sa Kasagaran nga Presyo sa Komunidad ang mga sugyot sa ubang tindero.",
  ],
  "Watch the forecast": ["Tingnan ang pagtataya", "Tan-awa ang tagna"],
  "Price Forecast gives you a short-term projection so you can plan ahead for buying or selling.": [
    "Nagbibigay ang Pagtataya ng Presyo ng tantiya sa mga susunod na araw para makapagplano ka.",
    "Naghatag ang Tagna sa Presyo og banabana sa sunod nga mga adlaw aron makaplano ka.",
  ],
  "Still need help?": ["Kailangan pa ng tulong?", "Nanginahanglan pa og tabang?"],
  "Visit your local LGU office or reach out through the market coordinator for further assistance.": [
    "Pumunta sa inyong LGU office o makipag-ugnayan sa market coordinator.",
    "Adto sa inyong LGU office o kontaka ang market coordinator.",
  ],

  // Profile: fish sold
  "Fish I Sell": ["Mga Isdang Tinda Ko", "Mga Isda nga Akong Gibaligya"],
  "These appear first on your dashboard.": ["Una itong lalabas sa iyong dashboard.", "Kini ang unang makita sa imong dashboard."],
  "Save Fish List": ["I-save ang Listahan", "I-save ang Lista"],
  "Your fish list was saved.": ["Na-save ang listahan ng iyong isda.", "Na-save ang lista sa imong isda."],
};

export function translate(language, text, vars = {}) {
  const index = language === "fil" ? 0 : language === "ceb" ? 1 : -1;
  const template = index >= 0 ? PHRASES[text]?.[index] ?? text : text;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

// Language chosen on this device, remembered between visits.
export function useLanguageSetting() {
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return LANGUAGES.some((l) => l.code === saved) ? saved : "en";
    } catch {
      return "en";
    }
  });
  const setLanguage = (code) => {
    setLanguageState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage unavailable */ }
  };
  return [language, setLanguage];
}

export const LanguageContext = createContext("en");

// Returns t(text, vars) for the current language.
export function useT() {
  const language = useContext(LanguageContext);
  return (text, vars) => translate(language, text, vars);
}
