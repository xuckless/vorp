// Data: the three sentences the owner reads to enrol their voice, in their own language. About
// five seconds each, everyday words with a spread of vowels, consonants and intonation (a
// statement, a list, a question) so the voiceprint hears more than one kind of sound. Languages
// without a row fall back to English (`enrolmentSentences`).

import { normaliseLanguage } from './languages';

export type EnrolmentSentences = readonly [string, string, string];

export const ENROLMENT_SENTENCES: Readonly<Record<string, EnrolmentSentences>> = {
  en: [
    'The quick brown fox jumps over the lazy dog near the river bank.',
    'My favourite foods are fresh bread, sweet oranges and warm vegetable soup.',
    'Could you tell me how long it takes to get to the station by bus?',
  ],
  fr: [
    'Le petit chat gris dort tranquillement sur le rebord de la fenêtre.',
    "J'aime beaucoup le pain frais, les fraises sucrées et la soupe aux légumes.",
    'Pouvez-vous me dire combien de temps il faut pour aller à la gare en bus ?',
  ],
  es: [
    'El perro marrón corre rápidamente por el parque junto al río.',
    'Mis comidas favoritas son el pan recién hecho, las naranjas dulces y la sopa caliente.',
    '¿Podría decirme cuánto tiempo se tarda en llegar a la estación en autobús?',
  ],
  de: [
    'Der kleine graue Hund läuft jeden Morgen schnell durch den grünen Park.',
    'Ich esse gern frisches Brot, süße Orangen und eine warme Gemüsesuppe.',
    'Können Sie mir sagen, wie lange man mit dem Bus zum Bahnhof braucht?',
  ],
  it: [
    'Il piccolo gatto grigio dorme tranquillo sul davanzale della finestra.',
    'I miei cibi preferiti sono il pane fresco, le arance dolci e la zuppa di verdure.',
    'Potrebbe dirmi quanto tempo ci vuole per arrivare alla stazione in autobus?',
  ],
  'pt-BR': [
    'O cachorro marrom corre rapidamente pelo parque perto do rio.',
    'Minhas comidas favoritas são pão fresquinho, laranjas doces e sopa de legumes quente.',
    'Você pode me dizer quanto tempo leva para chegar à estação de ônibus?',
  ],
  'pt-PT': [
    'O cão castanho corre depressa pelo jardim perto do rio.',
    'As minhas comidas preferidas são pão fresco, laranjas doces e sopa de legumes quente.',
    'Pode dizer-me quanto tempo demora a chegar à estação de autocarro?',
  ],
  nl: [
    'De kleine grijze kat slaapt rustig op de vensterbank in de zon.',
    'Ik eet graag vers brood, zoete sinaasappels en warme groentesoep.',
    'Kunt u mij vertellen hoe lang het duurt om met de bus naar het station te gaan?',
  ],
  pl: [
    'Mały szary kot śpi spokojnie na parapecie w słońcu.',
    'Najbardziej lubię świeży chleb, słodkie pomarańcze i ciepłą zupę jarzynową.',
    'Czy może mi pan powiedzieć, jak długo jedzie się autobusem na dworzec?',
  ],
  ru: [
    'Маленький серый кот спокойно спит на подоконнике у окна.',
    'Я люблю свежий хлеб, сладкие апельсины и горячий овощной суп.',
    'Скажите, пожалуйста, сколько времени ехать до вокзала на автобусе?',
  ],
  uk: [
    'Маленький сірий кіт спокійно спить на підвіконні біля вікна.',
    'Я люблю свіжий хліб, солодкі апельсини та гарячий овочевий суп.',
    'Скажіть, будь ласка, скільки часу їхати до вокзалу автобусом?',
  ],
  tr: [
    'Küçük gri kedi pencerenin kenarında sessizce uyuyor.',
    'En sevdiğim yiyecekler taze ekmek, tatlı portakal ve sıcak sebze çorbası.',
    'Otobüsle istasyona gitmenin ne kadar sürdüğünü söyleyebilir misiniz?',
  ],
  ar: [
    'القطة الرمادية الصغيرة تنام بهدوء بجانب النافذة.',
    'أحب الخبز الطازج والبرتقال الحلو وشوربة الخضار الساخنة.',
    'هل يمكنك أن تخبرني كم من الوقت يستغرق الوصول إلى المحطة بالحافلة؟',
  ],
  he: [
    'החתול האפור הקטן ישן בשקט על אדן החלון.',
    'אני אוהב לחם טרי, תפוזים מתוקים ומרק ירקות חם.',
    'אתה יכול להגיד לי כמה זמן לוקח להגיע לתחנה באוטובוס?',
  ],
  fa: [
    'گربه‌ی خاکستری کوچک آرام کنار پنجره خوابیده است.',
    'من نان تازه، پرتقال شیرین و سوپ گرم سبزیجات را دوست دارم.',
    'می‌توانید به من بگویید رسیدن به ایستگاه با اتوبوس چقدر طول می‌کشد؟',
  ],
  hi: [
    'छोटी भूरी बिल्ली खिड़की के पास आराम से सो रही है।',
    'मुझे ताज़ी रोटी, मीठे संतरे और गरम सब्ज़ी का सूप बहुत पसंद है।',
    'क्या आप बता सकते हैं कि बस से स्टेशन पहुँचने में कितना समय लगता है?',
  ],
  ur: [
    'چھوٹی بھوری بلی کھڑکی کے پاس آرام سے سو رہی ہے۔',
    'مجھے تازہ روٹی، میٹھے سنگترے اور گرم سبزی کا سوپ بہت پسند ہے۔',
    'کیا آپ بتا سکتے ہیں کہ بس سے اسٹیشن پہنچنے میں کتنا وقت لگتا ہے؟',
  ],
  bn: [
    'ছোট্ট ধূসর বিড়ালটি জানালার পাশে শান্তভাবে ঘুমাচ্ছে।',
    'আমি টাটকা রুটি, মিষ্টি কমলা আর গরম সবজির স্যুপ খেতে ভালোবাসি।',
    'বাসে করে স্টেশনে পৌঁছাতে কত সময় লাগে, আপনি কি বলতে পারবেন?',
  ],
  'zh-Hans': [
    '小灰猫安静地睡在窗台上，晒着温暖的太阳。',
    '我最喜欢吃新鲜的面包、甜甜的橙子和热乎乎的蔬菜汤。',
    '请问坐公共汽车到火车站需要多长时间？',
  ],
  'zh-Hant': [
    '小灰貓安靜地睡在窗台上，曬著溫暖的太陽。',
    '我最喜歡吃新鮮的麵包、甜甜的橙子和熱呼呼的蔬菜湯。',
    '請問坐公車到火車站需要多長時間？',
  ],
  ja: [
    '小さな灰色の猫が窓辺で静かに眠っています。',
    '焼きたてのパンと甘いオレンジ、温かい野菜のスープが大好きです。',
    'バスで駅まで行くのにどのくらい時間がかかりますか？',
  ],
  ko: [
    '작은 회색 고양이가 창가에서 조용히 자고 있어요.',
    '저는 갓 구운 빵과 달콤한 오렌지, 따뜻한 야채수프를 좋아해요.',
    '버스로 역까지 가는 데 시간이 얼마나 걸리는지 알려 주시겠어요?',
  ],
  vi: [
    'Con mèo xám nhỏ đang ngủ yên bên cửa sổ đầy nắng.',
    'Tôi thích bánh mì nóng giòn, cam ngọt và một bát canh rau thật ấm.',
    'Bạn có thể cho tôi biết đi xe buýt đến nhà ga mất bao lâu không?',
  ],
  id: [
    'Kucing abu-abu kecil itu tidur dengan tenang di dekat jendela.',
    'Saya suka roti segar, jeruk manis, dan sup sayur yang hangat.',
    'Bisakah Anda memberi tahu saya berapa lama naik bus ke stasiun?',
  ],
  sw: [
    'Paka mdogo wa kijivu analala kwa utulivu karibu na dirisha.',
    'Ninapenda mkate mbichi, machungwa matamu na supu ya mboga iliyo moto.',
    'Unaweza kuniambia inachukua muda gani kufika kituoni kwa basi?',
  ],
  sv: [
    'Den lilla grå katten sover lugnt på fönsterbrädan i solen.',
    'Jag tycker om färskt bröd, söta apelsiner och varm grönsakssoppa.',
    'Kan du säga hur lång tid det tar att åka buss till stationen?',
  ],
  el: [
    'Η μικρή γκρίζα γάτα κοιμάται ήσυχα στο περβάζι του παραθύρου.',
    'Μου αρέσει το φρέσκο ψωμί, τα γλυκά πορτοκάλια και η ζεστή σούπα λαχανικών.',
    'Μπορείτε να μου πείτε πόση ώρα κάνει το λεωφορείο μέχρι τον σταθμό;',
  ],
};

const primary = (code: string) => code.toLowerCase().split('-')[0];

/**
 * The sentences for a language: its own row, else a row with the same primary subtag
 * ('pt' reads the 'pt-BR' row), else English.
 */
export function enrolmentSentences(language: string): EnrolmentSentences {
  const code = normaliseLanguage(language);
  const exact = ENROLMENT_SENTENCES[code];
  if (exact) return exact;
  const near = Object.keys(ENROLMENT_SENTENCES).find((k) => primary(k) === primary(code));
  return ENROLMENT_SENTENCES[near ?? 'en'];
}
