export type PhraseCategory = {
  key: string;
  icon: string;
  label: string;
  phrases: Phrase[];
};

export type Phrase = {
  en: string;
  ja: string;
  romaji: string;
};

export const PHRASE_CATEGORIES: PhraseCategory[] = [
  {
    key: "restaurant",
    icon: "🍽️",
    label: "Restaurant",
    phrases: [
      { en: "Is this halal / vegetarian?", ja: "これはハラル/ベジタリアンですか？", romaji: "Kore wa hararu / bejitarian desu ka?" },
      { en: "No peanuts please.", ja: "ピーナッツなしでお願いします。", romaji: "Pīnattsu nashi de onegaishimasu." },
      { en: "Could I have the menu in English?", ja: "英語のメニューはありますか？", romaji: "Eigo no menyū wa arimasu ka?" },
      { en: "Check, please.", ja: "お会計お願いします。", romaji: "Okaikei onegaishimasu." },
      { en: "Delicious! Thank you.", ja: "美味しかったです、ありがとう！", romaji: "Oishikatta desu, arigatō!" },
    ],
  },
  {
    key: "transport",
    icon: "🚃",
    label: "Transport",
    phrases: [
      { en: "How do I get to ◯◯?", ja: "◯◯までどう行けばいいですか？", romaji: "◯◯ made dō ikeba ii desu ka?" },
      { en: "Which platform for ◯◯?", ja: "◯◯は何番線ですか？", romaji: "◯◯ wa nan-bansen desu ka?" },
      { en: "Is this the right train?", ja: "この電車で合っていますか？", romaji: "Kono densha de atte imasu ka?" },
      { en: "I would like a ticket to ◯◯.", ja: "◯◯までの切符をください。", romaji: "◯◯ made no kippu o kudasai." },
      { en: "What time is the next train?", ja: "次の電車は何時ですか？", romaji: "Tsugi no densha wa nanji desu ka?" },
    ],
  },
  {
    key: "hotel",
    icon: "🏨",
    label: "Hotel",
    phrases: [
      { en: "Check-in, please.", ja: "チェックインお願いします。", romaji: "Chekkuin onegaishimasu." },
      { en: "Is breakfast included?", ja: "朝食は含まれていますか？", romaji: "Chōshoku wa fukumarete imasu ka?" },
      { en: "Could I have the Wi-Fi password?", ja: "Wi-Fiのパスワードを教えてください。", romaji: "Wai-fai no pasuwādo o oshiete kudasai." },
      { en: "Could you keep my luggage?", ja: "荷物を預かってもらえますか？", romaji: "Nimotsu o azukatte moraemasu ka?" },
    ],
  },
  {
    key: "medical",
    icon: "🏥",
    label: "Medical",
    phrases: [
      { en: "I need a doctor.", ja: "医者が必要です。", romaji: "Isha ga hitsuyō desu." },
      { en: "I'm allergic to ◯◯.", ja: "◯◯にアレルギーがあります。", romaji: "◯◯ ni arerugī ga arimasu." },
      { en: "It hurts here.", ja: "ここが痛いです。", romaji: "Koko ga itai desu." },
      { en: "Please call an ambulance.", ja: "救急車を呼んでください。", romaji: "Kyūkyūsha o yonde kudasai." },
      { en: "Where is the nearest hospital?", ja: "一番近い病院はどこですか？", romaji: "Ichiban chikai byōin wa doko desu ka?" },
    ],
  },
  {
    key: "shopping",
    icon: "🛍️",
    label: "Shopping",
    phrases: [
      { en: "Can I try this on?", ja: "試着してもいいですか？", romaji: "Shichaku shite mo ii desu ka?" },
      { en: "Tax-free, please.", ja: "免税でお願いします。", romaji: "Menzei de onegaishimasu." },
      { en: "Do you accept credit cards?", ja: "クレジットカードは使えますか？", romaji: "Kurejitto kādo wa tsukaemasu ka?" },
      { en: "How much is this?", ja: "これはいくらですか？", romaji: "Kore wa ikura desu ka?" },
    ],
  },
  {
    key: "general",
    icon: "🙏",
    label: "General",
    phrases: [
      { en: "Thank you.", ja: "ありがとうございます。", romaji: "Arigatō gozaimasu." },
      { en: "Excuse me.", ja: "すみません。", romaji: "Sumimasen." },
      { en: "I don't understand.", ja: "わかりません。", romaji: "Wakarimasen." },
      { en: "Do you speak English?", ja: "英語を話せますか？", romaji: "Eigo o hanasemasu ka?" },
      { en: "Help!", ja: "助けてください！", romaji: "Tasukete kudasai!" },
    ],
  },
];
