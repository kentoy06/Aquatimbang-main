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
  "No photo yet": ["Wala pang larawan", "Wala pay hulagway"],
  "No fish species registered": ["Wala pang nakarehistrong isda", "Wala pay narehistro nga isda"],
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
  // Fish scanner (phase 1)
  "Scan fish": ["I-scan ang isda", "I-scan ang isda"],
  "Scan Fish": ["I-scan ang Isda", "I-scan ang Isda"],
  "Take a photo of your fish to help build the AquaTimbang fish scanner.": [
    "Kunan ng litrato ang iyong isda para makatulong sa paggawa ng AquaTimbang fish scanner.",
    "Kuhai og litrato ang imong isda aron makatabang sa paghimo sa AquaTimbang fish scanner.",
  ],
  "Take a clear photo of the fish only, with no people in it. Then choose which fish it is. Your photos help build a scanner that will recognize fish automatically.": [
    "Kumuha ng malinaw na litrato ng isda lamang, walang tao. Piliin kung anong isda ito. Makatutulong ang iyong mga litrato sa paggawa ng scanner na kusang makakakilala ng isda.",
    "Pagkuha og klaro nga litrato sa isda lang, walay tawo. Pilia kung unsang isdaa kini. Makatabang ang imong mga litrato sa paghimo og scanner nga makaila sa isda.",
  ],
  "Lay the fish flat, fill the photo with it, and use good light.": [
    "Ilatag nang patag ang isda, punuin ang litrato nito, at gumamit ng magandang ilaw.",
    "Ipahigda ang isda, pun-a ang litrato niini, ug gamita ang maayong suga.",
  ],
  "Take Photo": ["Kumuha ng Litrato", "Pagkuha og Litrato"],
  "Retake Photo": ["Kunan Muli", "Kuhai Pag-usab"],
  "Choose from Album": ["Pumili sa Album", "Pagpili sa Album"],
  "Your fish photo": ["Litrato ng iyong isda", "Litrato sa imong isda"],
  "Which fish is this?": ["Anong isda ito?", "Unsang isdaa kini?"],
  "Save Photo": ["I-save ang Litrato", "I-save ang Litrato"],
  "Photo saved. Thank you!": ["Na-save ang litrato. Salamat!", "Na-save ang litrato. Salamat!"],
  "Your {fish} photo will be checked by the LGU and used to teach the AquaTimbang fish scanner.": [
    "Susuriin ng LGU ang iyong litrato ng {fish} at gagamitin para turuan ang AquaTimbang fish scanner.",
    "Susihon sa LGU ang imong litrato sa {fish} ug gamiton aron tudloan ang AquaTimbang fish scanner.",
  ],
  "{fish}: {count} of {target} photos": ["{fish}: {count} sa {target} litrato", "{fish}: {count} sa {target} ka litrato"],
  "Fish photos you have shared: {n}": [
    "Mga litrato ng isda na naibahagi mo: {n}",
    "Mga litrato sa isda nga imong naambit: {n}",
  ],
  "Scan another fish": ["Mag-scan ng iba pang isda", "Pag-scan og laing isda"],
  "Done": ["Tapos na", "Human na"],
  // Profit Helper
  "Profit Helper": ["Tulong sa Kita", "Tabang sa Ganansya"],
  "Enter what you paid at the fish port to see your profit and a fair selling price.": [
    "Ilagay ang ibinayad mo sa bagsakan para makita ang iyong kita at patas na presyo ng benta.",
    "Ibutang ang imong gibayad sa bagsakan aron makita ang imong ganansya ug patas nga presyo sa baligya.",
  ],
  "Kilos bought": ["Kilong binili", "Kilo nga gipalit"],
  "Buying price per kg": ["Presyo ng bili kada kg", "Presyo sa pagpalit matag kg"],
  "Other costs": ["Ibang gastos", "Ubang gasto"],
  "ice, transport, stall fee": ["yelo, pamasahe, bayad sa puwesto", "yelo, plete, bayad sa puwesto"],
  "Expected unsold or spoiled": ["Inaasahang hindi mabebenta o masisira", "Gidahom nga dili mabaligya o madunot"],
  "Your selling price per kg": ["Iyong presyo ng benta kada kg", "Imong presyo sa baligya matag kg"],
  "Leave blank to use the LGU price ({price}).": [
    "Iwanang blangko para gamitin ang presyo ng LGU ({price}).",
    "Biyai nga blangko aron gamiton ang presyo sa LGU ({price}).",
  ],
  "No LGU price for this fish yet, so enter your own selling price.": [
    "Wala pang presyo ng LGU para sa isdang ito, kaya ilagay ang sarili mong presyo.",
    "Wala pay presyo sa LGU para niining isdaa, busa ibutang ang imong kaugalingong presyo.",
  ],
  "Kilos bought must be more than zero.": ["Dapat higit sa zero ang kilong binili.", "Kinahanglan labaw sa zero ang kilo nga gipalit."],
  "Buying price must be more than zero.": ["Dapat higit sa zero ang presyo ng bili.", "Kinahanglan labaw sa zero ang presyo sa pagpalit."],
  "Other costs can't be negative.": ["Hindi puwedeng negatibo ang ibang gastos.", "Dili pwede negatibo ang ubang gasto."],
  "Unsold or spoiled must be from 0 to 99%.": ["Dapat 0 hanggang 99% ang hindi mabebenta.", "Kinahanglan 0 hangtod 99% ang dili mabaligya."],
  "Selling price must be more than zero.": ["Dapat higit sa zero ang presyo ng benta.", "Kinahanglan labaw sa zero ang presyo sa baligya."],
  "Fill in the kilos and buying price to see your profit.": [
    "Ilagay ang kilo at presyo ng bili para makita ang iyong kita.",
    "Ibutang ang kilo ug presyo sa pagpalit aron makita ang imong ganansya.",
  ],
  "EXPECTED PROFIT": ["INAASAHANG KITA", "GIDAHOM NGA GANANSYA"],
  "EXPECTED LOSS": ["INAASAHANG LUGI", "GIDAHOM NGA PILDI"],
  "{kg} kg sold at {price}/kg": ["{kg} kg na naibenta sa {price}/kg", "{kg} kg nga nabaligya sa {price}/kg"],
  "margin": ["tubo", "tubo"],
  "Total cost": ["Kabuuang gastos", "Tibuok gasto"],
  "Expected sales": ["Inaasahang benta", "Gidahom nga halin"],
  "Break-even price": ["Presyong walang lugi", "Presyo nga walay pildi"],
  "Profit per kg": ["Kita kada kg", "Ganansya matag kg"],
  "Suggested price": ["Iminumungkahing presyo", "Gisugyot nga presyo"],
  "Sell between {low} and {high} per kg. You cover your costs and stay within the LGU price.": [
    "Magbenta sa pagitan ng {low} at {high} kada kg. Bawi ang gastos mo at pasok sa presyo ng LGU.",
    "Ibaligya tali sa {low} ug {high} matag kg. Mabawi nimo ang gasto ug sulod ra sa presyo sa LGU.",
  ],
  "The LGU price doesn't cover your costs": ["Hindi sapat ang presyo ng LGU sa iyong gastos", "Dili igo ang presyo sa LGU sa imong gasto"],
  "To break even at {price}/kg, buy at {max}/kg or less, or lower your other costs.": [
    "Para walang lugi sa {price}/kg, bumili sa {max}/kg pababa, o bawasan ang ibang gastos.",
    "Aron walay pildi sa {price}/kg, palit sa {max}/kg paubos, o pakunhuran ang ubang gasto.",
  ],
  "Your other costs are too high for this amount of fish. Buy more kilos or lower your costs.": [
    "Masyadong mataas ang ibang gastos para sa dami ng isda. Bumili ng mas maraming kilo o bawasan ang gastos.",
    "Taas kaayo ang ubang gasto para sa gidaghanon sa isda. Palit og mas daghang kilo o pakunhuran ang gasto.",
  ],
  "Above the LGU price": ["Lampas sa presyo ng LGU", "Labaw sa presyo sa LGU"],
  "Your price is {diff}/kg higher than the LGU price. Buyers and inspectors may see this as overpricing.": [
    "Mas mataas ng {diff}/kg ang presyo mo kaysa sa LGU. Maaaring ituring itong overpricing ng mamimili at inspektor.",
    "Mas taas og {diff}/kg ang imong presyo kaysa sa LGU. Mahimong isipon kini nga overpricing sa mamalit ug inspektor.",
  ],
  "Price outlook (next 7 days)": ["Takbo ng presyo (susunod na 7 araw)", "Dagan sa presyo (sunod nga 7 ka adlaw)"],
  "Checking the forecast…": ["Tinitingnan ang forecast…", "Gitan-aw ang forecast…"],
  "No forecast yet for this fish. It needs more price history.": [
    "Wala pang forecast para sa isdang ito. Kailangan pa ng mas maraming presyo.",
    "Wala pay forecast para niining isdaa. Kinahanglan pa og daghang presyo.",
  ],
  "Prices are expected to rise about {pct}% (around {avg}/kg). A good time to stock up, since your fish may sell higher.": [
    "Inaasahang tataas ang presyo nang mga {pct}% (mga {avg}/kg). Magandang mag-imbak ngayon dahil puwedeng mas mahal ang benta.",
    "Gidahom nga mosaka ang presyo og mga {pct}% (mga {avg}/kg). Maayo nga mopalit og daghan karon kay mahimong mas mahal ang baligya.",
  ],
  "Prices are expected to drop about {pct}% (around {avg}/kg). Buy only what you can sell soon.": [
    "Inaasahang bababa ang presyo nang mga {pct}% (mga {avg}/kg). Bumili lang ng kaya mong ibenta agad.",
    "Gidahom nga mous-os ang presyo og mga {pct}% (mga {avg}/kg). Palit lang sa imong mabaligya dayon.",
  ],
  "Prices should stay about the same (around {avg}/kg).": [
    "Halos hindi magbabago ang presyo (mga {avg}/kg).",
    "Halos dili mausab ang presyo (mga {avg}/kg).",
  ],
  "For planning only. Nothing here is saved or shared with the LGU.": [
    "Para sa pagpaplano lamang. Walang nase-save o ibinabahagi sa LGU.",
    "Para sa pagplano lamang. Walay ma-save o ipaambit sa LGU.",
  ],
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
  "Hover or tap a point to see that day's price.": [
    "Pindutin o itapat ang cursor sa tuldok para makita ang presyo sa araw na iyon.",
    "Pindota o itutok ang cursor sa tulbok aron makita ang presyo niadtong adlawa.",
  ],
  "Announcements": ["Mga Anunsyo", "Mga Pahibalo gikan sa Admin"],
  "Pending Review": ["Naghihintay ng Pagsusuri", "Naghulat sa Pagsusi"],
  "Reviewed": ["Nasuri na", "Nasusi na"],
  "Adopted": ["Tinanggap", "Gidawat"],
  "Rejected": ["Hindi tinanggap", "Wala gidawat"],
  "Withdrawn": ["Binawi", "Gibawi"],
  "Edit": ["I-edit", "Usba"],
  "Withdraw": ["Bawiin", "Bawia"],
  "Please confirm": ["Pakikumpirma", "Palihug kumpirmaha"],
  "Save": ["I-save", "I-save"],
  "Cancel": ["Kanselahin", "Kanselahon"],
  "Enter a price greater than zero.": ["Maglagay ng presyong higit sa zero.", "Pagbutang og presyo nga labaw sa zero."],
  "Suggestion updated.": ["Na-update ang mungkahi.", "Na-update ang sugyot."],
  "Suggestion withdrawn.": ["Binawi ang mungkahi.", "Gibawi ang sugyot."],
  "Withdraw your {fish} suggestion? The LGU will no longer review it.": [
    "Bawiin ang iyong mungkahi para sa {fish}? Hindi na ito susuriin ng LGU.",
    "Bawion ang imong sugyot para sa {fish}? Dili na kini susihon sa LGU.",
  ],
  "You can edit or withdraw a suggestion until the LGU reviews it.": [
    "Maaari mong i-edit o bawiin ang mungkahi hangga't hindi pa ito nasusuri ng LGU.",
    "Mahimo nimong usbon o bawion ang sugyot samtang wala pa kini masusi sa LGU.",
  ],
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
  "Community Average shows what other vendors are suggesting, so you can see if your numbers line up.": [
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
  // Price Forecast and "Why is the price changing?"
  "Short-term price estimates to help you decide when to sell.": ["Panandaliang tantiya ng presyo para matulungan kang magpasya kung kailan magbebenta.", "Mubong tantiya sa presyo aron makatabang nimo sa pagdesisyon kanus-a mobaligya."],
  "Short-term price forecasts from published prices and external factors (SARIMAX).": ["Panandaliang pagtataya ng presyo mula sa nailathalang presyo at panlabas na salik (SARIMAX).", "Mubong tagna sa presyo gikan sa gipatik nga presyo ug gawas nga hinungdan (SARIMAX)."],
  "Fish species": ["Uri ng isda", "Klase sa isda"],
  "No fish species": ["Walang uri ng isda", "Walay klase sa isda"],
  "Municipality": ["Munisipyo", "Munisipyo"],
  "Forecast period": ["Panahon ng pagtataya", "Gidugayon sa tagna"],
  "Next {n} days": ["Susunod na {n} araw", "Sunod nga {n} ka adlaw"],
  "Estimates only — not official LGU prices": ["Tantiya lamang — hindi opisyal na presyo ng LGU", "Tantiya lang — dili opisyal nga presyo sa LGU"],
  "Forecasts show the most likely price and a 95% range. Real prices can fall outside it during unusual market events.": ["Ipinapakita ng pagtataya ang pinakamalamang na presyo at 95% na saklaw. Maaaring lumabas dito ang totoong presyo kapag may di-pangkaraniwang pangyayari sa merkado.", "Gipakita sa tagna ang labing posibleng presyo ug 95% nga gilapdon. Ang tinuod nga presyo mahimong molapas niini kung adunay dili kasagaran nga panghitabo sa merkado."],
  "Running the forecast model…": ["Pinapatakbo ang modelo ng pagtataya…", "Gipadagan ang modelo sa tagna…"],
  "The first forecast after new prices are published can take up to a minute.": ["Ang unang pagtataya pagkatapos mailathala ang bagong presyo ay maaaring tumagal nang hanggang isang minuto.", "Ang unang tagna human mapatik ang bag-ong presyo mahimong moabot og usa ka minuto."],
  "Select a fish species to see its forecast.": ["Pumili ng uri ng isda para makita ang pagtataya nito.", "Pilia ang klase sa isda aron makita ang tagna niini."],
  "Latest Published Price": ["Pinakabagong Nailathalang Presyo", "Pinakabag-ong Gipatik nga Presyo"],
  "Forecast for {date}": ["Pagtataya para sa {date}", "Tagna para sa {date}"],
  "range": ["saklaw", "gilapdon"],
  "Forecast Accuracy (MAPE)": ["Katumpakan ng Pagtataya (MAPE)", "Kasaktuhan sa Tagna (MAPE)"],
  "Average error on the last {n} days": ["Karaniwang mali sa huling {n} araw", "Kasagarang sayop sa katapusang {n} ka adlaw"],
  "Not measured for trend lines": ["Hindi sinusukat para sa trend line", "Wala gisukod para sa trend line"],
  "Model": ["Modelo", "Modelo"],
  "Trend": ["Takbo", "Dagan"],
  "Last {past} days of published prices and the next {next} days": ["Huling {past} araw ng nailathalang presyo at ang susunod na {next} araw", "Katapusang {past} ka adlaw sa gipatik nga presyo ug ang sunod nga {next} ka adlaw"],
  "Forecast exported.": ["Na-export ang pagtataya.", "Na-export ang tagna."],
  "Export CSV": ["I-export ang CSV", "I-export ang CSV"],
  "Published price": ["Nailathalang presyo", "Gipatik nga presyo"],
  "Forecast": ["Pagtataya", "Tagna"],
  "95% range": ["95% na saklaw", "95% nga gilapdon"],
  "95% RANGE": ["95% NA SAKLAW", "95% NGA GILAPDON"],
  "Insight": ["Obserbasyon", "Obserbasyon"],
  "{fish} is expected to stay about the same over the next {n} days, ": ["Inaasahang halos hindi magbabago ang {fish} sa susunod na {n} araw, ", "Gidahom nga halos dili mausab ang {fish} sa sunod nga {n} ka adlaw, "],
  "{fish} is expected to rise by about {pct}% over the next {n} days, ": ["Inaasahang tataas ang {fish} nang mga {pct}% sa susunod na {n} araw, ", "Gidahom nga mosaka ang {fish} og mga {pct}% sa sunod nga {n} ka adlaw, "],
  "{fish} is expected to ease by about {pct}% over the next {n} days, ": ["Inaasahang bababa ang {fish} nang mga {pct}% sa susunod na {n} araw, ", "Gidahom nga moubos ang {fish} og mga {pct}% sa sunod nga {n} ka adlaw, "],
  "ending near {price} per kilogram (likely between {low} and {high}).": ["at aabot sa mga {price} bawat kilo (malamang nasa pagitan ng {low} at {high}).", "ug moabot sa mga {price} kada kilo (posibleng tali sa {low} ug {high})."],
  "The highest price is expected on {date}, at about {price}.": ["Inaasahang pinakamataas ang presyo sa {date}, sa mga {price}.", "Gidahom nga pinakataas ang presyo sa {date}, mga {price}."],
  "External Factors": ["Panlabas na Salik", "Gawas nga Hinungdan"],
  "Effect of each factor found by the model": ["Epekto ng bawat salik na nakita ng modelo", "Epekto sa matag hinungdan nga nakita sa modelo"],
  "No external factors were used — the forecast is based on price history only.": ["Walang ginamit na panlabas na salik — batay lamang ang pagtataya sa nakaraang presyo.", "Walay gigamit nga gawas nga hinungdan — ang tagna gibase lang sa kanhing presyo."],
  "External factors are only used by the SARIMAX model.": ["Ang SARIMAX model lang ang gumagamit ng panlabas na salik.", "Ang SARIMAX model ra ang mogamit og gawas nga hinungdan."],
  "Fuel price": ["Presyo ng krudo", "Presyo sa krudo"],
  "Rainy weather": ["Maulang panahon", "Ulanong panahon"],
  "Stormy weather": ["Mabagyong panahon", "Bagyohon nga panahon"],
  "Holiday": ["Pista opisyal", "Holiday"],
  "Each ₱1/liter rise in fuel raises the price by about {amount}.": ["Bawat ₱1/litro na pagtaas ng krudo ay nagpapataas sa presyo nang mga {amount}.", "Matag ₱1/litro nga pagsaka sa krudo mopataas sa presyo og mga {amount}."],
  "Each ₱1/liter rise in fuel lowers the price by about {amount}.": ["Bawat ₱1/litro na pagtaas ng krudo ay nagpapababa sa presyo nang mga {amount}.", "Matag ₱1/litro nga pagsaka sa krudo mopaubos sa presyo og mga {amount}."],
  "{factor} raises the price by about {amount}.": ["Ang {factor} ay nagpapataas sa presyo nang mga {amount}.", "Ang {factor} mopataas sa presyo og mga {amount}."],
  "{factor} lowers the price by about {amount}.": ["Ang {factor} ay nagpapababa sa presyo nang mga {amount}.", "Ang {factor} mopaubos sa presyo og mga {amount}."],
  "Model Details": ["Detalye ng Modelo", "Detalye sa Modelo"],
  "How this forecast was made": ["Paano ginawa ang pagtatayang ito", "Giunsa paghimo kining tagna"],
  "Training data": ["Datos na pinag-aralan", "Datos nga gitun-an"],
  "{n} days": ["{n} araw", "{n} ka adlaw"],
  "Generated": ["Ginawa noong", "Gihimo niadtong"],
  "Confidence level": ["Antas ng kumpiyansa", "Lebel sa kasiguroan"],
  "Daily Forecast": ["Araw-araw na Pagtataya", "Adlaw-adlaw nga Tagna"],
  "Most likely price and 95% range per day": ["Pinakamalamang na presyo at 95% na saklaw bawat araw", "Labing posibleng presyo ug 95% nga gilapdon matag adlaw"],
  "FORECAST / KG": ["PAGTATAYA / KILO", "TAGNA / KILO"],
  "Why is the price changing?": ["Bakit nagbabago ang presyo?", "Nganong nausab ang presyo?"],
  "Based on recorded weather, fuel prices, holidays and BFAR closed fishing seasons": ["Batay sa naitalang panahon, presyo ng krudo, pista opisyal at saradong panahon ng pangingisda ng BFAR", "Gibase sa natala nga panahon, presyo sa krudo, holiday ug sirado nga panahon sa pangisda sa BFAR"],
  "Checking what affected the price…": ["Sinusuri kung ano ang nakaapekto sa presyo…", "Gisusi kung unsay nakaapekto sa presyo…"],
  "Steady": ["Hindi nagbago", "Wala nausab"],
  "Compared {from} with {to}.": ["Ikinumpara ang {from} sa {to}.", "Gikumpara ang {from} sa {to}."],
  "No weather, fuel, holiday or closed-season records match this period. Logging External Factors daily gives better explanations.": ["Walang tala ng panahon, krudo, pista opisyal o saradong panahon para sa panahong ito. Mas maganda ang paliwanag kung araw-araw itinatala ang Panlabas na Salik.", "Walay rekord sa panahon, krudo, holiday o sirado nga panahon niining yugtoa. Mas maayo ang pagpasabot kung adlaw-adlaw itala ang Gawas nga Hinungdan."],
  "Pushes price up": ["Nagpapataas ng presyo", "Mopataas sa presyo"],
  "Pushes price down": ["Nagpapababa ng presyo", "Mopaubos sa presyo"],
  "Likely reason": ["Malamang na dahilan", "Posibleng hinungdan"],
  "These are possible reasons based on recorded data, not proof. Closed season dates come from BFAR and may change each year.": ["Ito ay mga posibleng dahilan batay sa naitalang datos, hindi patunay. Ang petsa ng saradong panahon ay mula sa BFAR at maaaring magbago bawat taon.", "Kini mga posibleng hinungdan base sa natala nga datos, dili pamatuod. Ang petsa sa sirado nga panahon gikan sa BFAR ug mahimong mausab matag tuig."],
  // Notifications
  "Today": ["Ngayong araw", "Karon nga adlaw"],
  "Yesterday": ["Kahapon", "Kagahapon"],
  "Earlier": ["Mas maaga", "Sa miaging mga adlaw"],
  "Restore Dismissed": ["Ibalik ang mga Itinago", "Ibalik ang mga Gitago"],
  "Read announcement": ["Basahin ang anunsyo", "Basaha ang pahibalo"],
  "Open": ["Buksan", "Ablihi"],
  "Dismiss": ["Itago", "Itago"],
  "Announcement": ["Anunsyo", "Pahibalo"],
  "from": ["mula kay", "gikan kang"],
  "Messages": ["Mga Mensahe", "Mga Mensahe"],
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
