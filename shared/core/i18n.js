// Farsi UI layer from the design handoff (i18n-fa.js), as a module. Translates rendered text, placeholder, title and aria-label;
// elements marked data-no-tr (user content) are left alone.
/* Farsi UI layer: translates rendered text nodes + placeholder/title/aria-label on the fly, restores English when switched off. */
const GSFA = (function () {
  const D = {
    // ---- shared / status
    '[ OK ]': '[ OK ]', '[WARN]': '[هشدار]', '[INFO]': '[اطلاع]', '[FAIL]': '[خطا]',
    'cancel': 'لغو', 'done': 'تمام', 'back': 'بازگشت', 'Back': 'بازگشت', '← back': '→ بازگشت', 'save': 'ذخیره', 'Save': 'ذخیره', 'remove': 'حذف', 'revoke': 'لغو دسترسی',
    'delete': 'حذف', 'edit': 'ویرایش', 'add': 'افزودن', 'Add': 'افزودن', 'dismiss': 'نادیده', 'undo': 'برگرداندن', 'enable': 'فعال‌سازی', 'disable': 'غیرفعال‌سازی',
    'search': 'جستجو', 'menu': 'منو', 'options': 'گزینه‌ها', 'download': 'دریافت', 'copy': 'رونوشت', 'copy link': 'رونوشت پیوند', 'copy code': 'رونوشت کد', 'copy codes': 'رونوشت کدها',
    '✓ copied': '✓ رونوشت شد', '✓ link copied': '✓ پیوند رونوشت شد', '✓ code copied': '✓ کد رونوشت شد', 'on': 'روشن', 'off': 'خاموش', 'optional': 'اختیاری', 'required': 'الزامی',
    'online': 'آنلاین', '● online': '● آنلاین', '● connected': '● متصل', 'connected': 'متصل', 'connecting': 'در حال اتصال', 'offline': 'آفلاین', 'reconnect': 'اتصال دوباره', 'go offline': 'قطع اتصال',
    'yesterday': 'دیروز', 'now': 'اکنون', '● now': '● اکنون', 'today': 'امروز', 'never': 'هرگز', 'unknown': 'ناشناس', 'version': 'نسخه', 'uptime': 'زمان کارکرد', 'latency': 'تأخیر',
    'next →': 'بعدی ←', '← prev': '→ قبلی', 'CONTINUE →': 'ادامه ←', 'Continue': 'ادامه', 'Enter': 'ورود', 'settings': 'تنظیمات', 'type': 'بنویسید', 'to confirm': 'برای تأیید',
    'green': 'سبز', 'lime': 'لیمویی', 'cyan': 'فیروزه‌ای', 'amber': 'کهربایی', 'system': 'سیستم', 'vazir': 'وزیر', 'q pixia': 'کیو پیکسیا', 'jetbrains mono': 'jetbrains mono',
    'everyone': 'همه', 'contacts': 'مخاطبین', 'nobody': 'هیچ‌کس', 'english': 'English', 'language': 'زبان', 'language --ui': 'زبان رابط',

    // ---- chat: onboarding
    'booting CHATS v2.1...': 'راه‌اندازی CHATS v2.1...', 'no server configured': 'هیچ سروری تنظیم نشده',
    'CONNECT /': 'اتصال /', 'enter the address of your chat server. ask whoever invited you.': 'نشانی سرور چت خود را وارد کنید. از کسی که دعوتتان کرده بپرسید.',
    'connect --server': 'نشانی سرور', 'recent ›': 'اخیر ›', 'tls handshake': 'دست‌دهی TLS', 'signup': 'ثبت‌نام', 'welcome': 'پیام خوش‌آمد',
    '// FINGERPRINT · SHA-256 · compare with your admin': '// اثرانگشت · SHA-256 · با مدیر سرور مقایسه کنید', '// FINGERPRINT · SHA-256': '// اثرانگشت · SHA-256',
    'waiting for session_': 'در انتظار نشست_', 'HELLO /': 'سلام /', 'Log in': 'ورود', 'Login': 'ورود', 'log in': 'ورود', 'create account': 'ساخت حساب', 'sign up': 'ثبت‌نام',
    '// sign in with': '// ورود با', 'passwd': 'گذرواژه', 'show': 'نمایش', 'hide': 'پنهان', '[ OK ] authenticating...': '[ OK ] در حال احراز هویت...',
    'forgot password? use recovery phrase': 'گذرواژه را فراموش کرده‌اید؟ از عبارت بازیابی استفاده کنید',
    'WHOAMI': 'معرفی', 'upload photo': 'بارگذاری عکس', 'change photo': 'تغییر عکس', '// optional. rendered in phosphor.': '// اختیاری. با رنگ فسفری نمایش داده می‌شود.',
    'whoami --name': 'نام نمایشی', 'set --username': 'نام کاربری', 'RECOVERY': 'بازیابی', 'RECOVER': 'بازیابی حساب', 'username': 'نام کاربری', 'email': 'ایمیل', 'phone': 'تلفن',
    "these 8 words are the only way back in if you forget your password. the server can't reset it for you. write them down or save the file offline.": 'این ۸ واژه تنها راه بازگشت به حساب در صورت فراموشی گذرواژه است. سرور نمی‌تواند آن را بازنشانی کند. آن‌ها را یادداشت کنید یا فایل را به‌صورت آفلاین نگه دارید.',
    "i saved these words somewhere safe. i understand they can't be shown again without my password.": 'این واژه‌ها را جای امنی ذخیره کردم. می‌دانم بدون گذرواژه دوباره نمایش داده نمی‌شوند.',
    'enter your username and the 8 words you saved at signup, in order.': 'نام کاربری و ۸ واژه‌ای را که هنگام ثبت‌نام ذخیره کردید به ترتیب وارد کنید.',
    'recover --user': 'نام کاربری', 'passwd --new': 'گذرواژه جدید', 'passwd --confirm': 'تکرار گذرواژه',
    '// other devices will be signed out. your phrase stays the same.': '// دستگاه‌های دیگر از حساب خارج می‌شوند. عبارت بازیابی تغییر نمی‌کند.',
    '[ .. ] verifying...': '[ .. ] در حال بررسی...', 'your name': 'نام شما', 'handle': 'شناسه', '6+ chars': 'حداقل ۶ نویسه', 'again': 'دوباره',

    // ---- chat: lists & nav
    'chats': 'گفتگوها', 'NEW GROUP': 'گروه جدید', 'new group': 'گروه جدید', 'mkgroup --name': 'نام گروه', 'Create group': 'ساخت گروه', 'group-name': 'نام-گروه',
    'add people...': 'افزودن افراد...', 'CONTACTS': 'مخاطبین', '// SORTED BY LAST SEEN': '// به ترتیب آخرین بازدید', 'NO CONTACTS': 'مخاطبی نیست', 'find contact...': 'یافتن مخاطب...',
    'grep chats...': 'جستجوی گفتگوها...', 'message': 'پیام', 'contact options': 'گزینه‌های مخاطب', 'install app': 'نصب برنامه', 'profile': 'نمایه', 'log out': 'خروج از حساب',
    'NO CHAT_': 'گفتگویی باز نیست_', '// pick a conversation, or press + for a new group': '// یک گفتگو انتخاب کنید یا برای گروه جدید + را بزنید',

    // ---- chat: settings
    'SETTINGS': 'تنظیمات', 'NOTIFICATIONS': 'اعلان‌ها', 'PRIVACY': 'حریم خصوصی', 'APPEARANCE': 'ظاهر', 'STORAGE': 'فضای ذخیره‌سازی', 'SECURITY': 'امنیت',
    'notifications': 'اعلان‌ها', 'privacy & security': 'حریم خصوصی و امنیت', 'appearance': 'ظاهر', 'storage': 'فضای ذخیره‌سازی', 'quota and usage': 'سهمیه و مصرف',
    'push for new messages': 'اعلان برای پیام‌های تازه', 'sounds': 'صداها', 'beep on receive': 'بوق هنگام دریافت', 'read receipts': 'رسید خواندن', 'send ✓✓ when read': 'ارسال ✓✓ پس از خواندن',
    '// PRIVACY': '// حریم خصوصی', '// SECURITY': '// امنیت', 'phone --visible-to': 'نمایش شماره تلفن برای', 'phosphor --color': 'رنگ فسفر', 'font --latin': 'قلم لاتین',
    'font --farsi --arabic': 'قلم فارسی و عربی', 'scanlines': 'خطوط اسکن', 'crt line overlay across the app': 'خطوط افقی CRT روی کل برنامه',
    'find me by id': 'یافتن من با شناسه', 'show online status': 'نمایش وضعیت آنلاین', 'recovery phrase': 'عبارت بازیابی',
    '8 words · view or generate new · needs password': '۸ واژه · مشاهده یا ساخت دوباره · نیاز به گذرواژه', 'devices': 'دستگاه‌ها', 'app lock': 'قفل برنامه',
    'passcode --digits': 'تعداد ارقام رمز', 'auto-lock --after': 'قفل خودکار پس از', '// applies to the installed app and this browser tab': '// برای برنامه نصب‌شده و همین زبانه مرورگر',
    'change passcode': 'تغییر رمز', 'lock now': 'همین حالا قفل کن', 'used': 'استفاده‌شده', '4 digit': '۴ رقمی', '6 digit': '۶ رقمی', 'on open': 'هنگام باز کردن',
    'DEVICES': 'دستگاه‌ها', '// THIS DEVICE': '// این دستگاه', '// OTHER SESSIONS': '// نشست‌های دیگر', 'JUST THIS ONE': 'فقط همین دستگاه',
    '// other sessions show up here when you log in on another phone or browser.': '// با ورود از گوشی یا مرورگر دیگر، نشست‌ها این‌جا نمایش داده می‌شوند.',
    'PROFILE': 'نمایه', 'set --phone': 'شماره تلفن', 'set --bio': 'درباره من', '[ OK ] wrote ~/.profile': '[ OK ] نمایه ذخیره شد',

    // ---- chat: conversation
    '── today ──': '── امروز ──', 'EMPTY BUFFER': 'هنوز پیامی نیست', '// say hi. messages are end-to-end encrypted.': '// سلام کنید. پیام‌ها سرتاسر رمزگذاری می‌شوند.',
    '// MENTION': '// نام بردن', 'enter to pick': 'enter برای انتخاب', 'ATTACH': 'پیوست', '// pick source': '// منبع را انتخاب کنید', 'add people': 'افزودن افراد',
    '// INVITE LINK': '// پیوند دعوت', 'FORWARD TO': 'هدایت به', '// pick a chat': '// یک گفتگو انتخاب کنید', '// all contacts are already members. share the link instead.': '// همه مخاطبین عضو هستند. پیوند را به اشتراک بگذارید.',
    '↪ forward': '↪ هدایت', 'INSTALL APP': 'نصب برنامه', '[ OK ] added to home screen': '[ OK ] به صفحه اصلی افزوده شد', 'EDIT CONTACT': 'ویرایش مخاطب', 'alias --name': 'نام مستعار',
    'SHARE TO': 'اشتراک با', 'REPORT MESSAGE': 'گزارش پیام', '// reason': '// دلیل', '// note · optional': '// یادداشت · اختیاری', 'report': 'گزارش',
    '// admins see this one message, the sender and your note. nothing else from the chat is decrypted.': '// مدیران فقط همین پیام، فرستنده و یادداشت شما را می‌بینند. چیز دیگری از گفتگو رمزگشایی نمی‌شود.',
    'message sealed for review': 'پیام برای بررسی ثبت شد', 'RECOVERY PHRASE': 'عبارت بازیابی', 'enter your password to reveal the phrase.': 'برای نمایش عبارت، گذرواژه خود را وارد کنید.',
    'reveal': 'نمایش', 'generate new': 'ساخت عبارت تازه', 'generate': 'بساز', '[ OK ] new phrase generated · the old one no longer works. save this now.': '[ OK ] عبارت تازه ساخته شد · عبارت قبلی دیگر کار نمی‌کند. همین حالا ذخیره‌اش کنید.',
    'your current 8 words stop working immediately. any saved copy becomes useless. devices stay signed in.': '۸ واژه فعلی بلافاصله از کار می‌افتند و نسخه‌های ذخیره‌شده بی‌اثر می‌شوند. دستگاه‌ها وارد می‌مانند.',
    'client': 'کلاینت', 'crypto': 'رمزنگاری', 'switch server': 'تغییر سرور', 'search in chat': 'جستجو در گفتگو', 'invite people': 'دعوت افراد', 'chat options': 'گزینه‌های گفتگو',
    'search messages...': 'جستجوی پیام‌ها...', 'view photo': 'مشاهده عکس', 'message options': 'گزینه‌های پیام', 'cancel reply': 'لغو پاسخ', 'cancel edit': 'لغو ویرایش', 'attach': 'پیوست',
    'send': 'ارسال', 'close preview': 'بستن پیش‌نمایش', 'previous photo': 'عکس قبلی', 'next photo': 'عکس بعدی', 'cancel share': 'لغو اشتراک', 'add a caption_': 'توضیح بنویسید_',
    'find chat...': 'یافتن گفتگو...', 'anything the admin should know': 'هر چیزی که مدیر باید بداند', 'server info': 'اطلاعات سرور', 'message...': 'پیام...', 'type a message_': 'پیام بنویسید_',
    'reply': 'پاسخ', 'forward': 'هدایت', 'view profile': 'مشاهده نمایه', 'group info': 'اطلاعات گروه', 'mute': 'بی‌صدا', 'unmute': 'باصدا', 'clear history': 'پاک‌کردن تاریخچه',
    'delete chat': 'حذف گفتگو', 'leave group': 'ترک گروه', 'clear': 'پاک کن', 'leave': 'ترک', 'delete contact': 'حذف مخاطب', 'edit contact': 'ویرایش مخاطب', 'saved ✓': 'ذخیره شد ✓',
    'photo': 'عکس', 'file': 'فایل', 'camera': 'دوربین', 'location': 'موقعیت', 'spam': 'هرزنامه', 'harassment': 'آزار', 'illegal content': 'محتوای غیرقانونی', 'impersonation': 'جعل هویت', 'other': 'سایر',
    'muted': 'بی‌صدا', 'typing...': 'در حال نوشتن...', 'filed': 'ثبت شد',

    // ---- admin
    'restricted console · chats.example.org · all actions are logged': 'کنسول محدود · chats.example.org · همه کارها ثبت می‌شوند', 'USERNAME': 'نام کاربری', 'PASSWORD': 'گذرواژه',
    'first run? set up this server →': 'اجرای نخست؟ راه‌اندازی این سرور ←', 'step 2 of 2 · enter the 6-digit code from your authenticator for': 'مرحله ۲ از ۲ · کد ۶ رقمی اپ احراز هویت را وارد کنید برای',
    'VERIFY': 'تأیید', 'set up authenticator': 'راه‌اندازی احراز هویت', 'SET UP TWO-FACTOR': 'راه‌اندازی تأیید دومرحله‌ای', 'required for every admin account': 'برای همه حساب‌های مدیر الزامی است',
    'scan with any TOTP app': 'با هر اپ TOTP اسکن کنید', 'or enter the secret manually': 'یا کلید را دستی وارد کنید', 'type the code it shows': 'کدی را که نشان می‌دهد بنویسید', 'ENABLE 2FA': 'فعال‌سازی 2FA',
    'sign out': 'خروج', 'exit setup': 'خروج از راه‌اندازی', 'ROOT': 'ریشه', 'SETUP': 'راه‌اندازی',
    'MONITOR': 'پایش', 'MANAGE': 'مدیریت', 'CONFIGURE': 'پیکربندی', 'overview': 'نمای کلی', 'health': 'سلامت', 'audit log': 'گزارش رویدادها', 'users': 'کاربران', 'reports': 'گزارش‌ها', 'invites': 'دعوت‌ها',
    'server settings': 'تنظیمات سرور', 'database': 'پایگاه داده', 'email / smtp': 'ایمیل / SMTP', 'two-factor': 'دومرحله‌ای', 'announcements': 'اطلاعیه‌ها', 'admins & security': 'مدیران و امنیت',
    'OVERVIEW': 'نمای کلی', 'USERS': 'کاربران', 'USER': 'کاربر', 'REPORTS': 'گزارش‌ها', 'INVITES': 'دعوت‌ها', 'STORAGE ': 'فضا', 'SERVER SETTINGS': 'تنظیمات سرور', 'ANNOUNCEMENTS': 'اطلاعیه‌ها',
    'AUDIT LOG': 'گزارش رویدادها', 'ADMINS & SECURITY': 'مدیران و امنیت', 'HEALTH': 'سلامت', 'DATABASE': 'پایگاه داده', 'EMAIL / SMTP': 'ایمیل / SMTP', 'TWO-FACTOR': 'تأیید دومرحله‌ای',
    'OWNER ACCOUNT': 'حساب مالک', 'READY TO LAUNCH': 'آماده اجرا', 'append-only · 90 day retention': 'فقط افزودنی · نگهداری ۹۰ روزه', 'engine · connection': 'موتور · اتصال',
    'maintenance mode is ON — clients see the maintenance screen.': 'حالت نگهداری روشن است — کاربران صفحه نگهداری را می‌بینند.',
    'CAPACITY': 'ظرفیت', 'TRAFFIC': 'ترافیک', 'OPEN REPORTS': 'گزارش‌های باز', 'view all →': 'همه ←', '∅ queue empty': '∅ صف خالی است', 'RECENT ACTIVITY': 'فعالیت اخیر', 'audit log →': 'گزارش رویدادها ←',
    'ONLINE NOW': 'آنلاین', 'MESSAGES TODAY': 'پیام‌های امروز', 'ERRORS · 24H': 'خطاها · ۲۴ ساعت', 'UPTIME': 'زمان کارکرد', 'VERSION': 'نسخه', 'REGISTRATION': 'ثبت‌نام',
    'attachments': 'پیوست‌ها', 'disk /var/lib/chats': 'دیسک /var/lib/chats', 'memory': 'حافظه', 'latest · up to date': 'آخرین نسخه · به‌روز', 'queue clear': 'صف خالی',
    'force logout': 'خروج اجباری', 'STATUS': 'وضعیت', 'clear filters': 'پاک‌کردن فیلترها', 'all': 'همه', 'active': 'فعال', 'disabled': 'غیرفعال', 'admin': 'مدیر',
    'ACTIVE': 'فعال', 'DISABLED': 'غیرفعال', 'ADMIN': 'مدیر', 'LIVE': 'فعال', 'REVOKED': 'لغوشده', 'EXPIRED': 'منقضی', 'USED UP': 'تمام‌شده', 'UP': 'برقرار', 'DOWN': 'قطع', 'DEGRADED': 'ضعیف', 'OK': 'OK', 'FAIL': 'خطا',
    'metadata only — messages, contacts and chat names are end-to-end encrypted.': 'فقط فراداده — پیام‌ها، مخاطبین و نام گفتگوها سرتاسر رمزگذاری شده‌اند.',
    'CREATED': 'ایجاد', 'LAST SEEN': 'آخرین بازدید', 'CHATS ': 'گفتگوها', 'QUOTA': 'سهمیه', '∅ no active sessions': '∅ نشست فعالی نیست', 'make admin': 'مدیر کن', 'make user': 'کاربر عادی کن',
    'user reports are turned off — clients hide the report option. turn on in server settings.': 'گزارش کاربران خاموش است — گزینه گزارش در برنامه پنهان است. از تنظیمات سرور روشن کنید.',
    'reported by': 'گزارش‌دهنده', 'delete message': 'حذف پیام', 'disable user': 'غیرفعال‌سازی کاربر', 'nothing here — the queue is clear': 'چیزی نیست — صف خالی است', 'open': 'باز', 'resolved': 'رسیدگی‌شده',
    '+ create code': '+ ساخت کد', 'CODE': 'کد', 'USES': 'استفاده', 'EXPIRES': 'انقضا', 'BY': 'سازنده', '∅ no invite codes yet — create one above': '∅ هنوز کد دعوتی نیست — بالا یکی بسازید',
    'chat names, members and content are encrypted. only opaque ids and sizes are shown.': 'نام، اعضا و محتوای گفتگوها رمزگذاری شده‌اند. فقط شناسه‌ها و اندازه‌ها نمایش داده می‌شوند.',
    'CHAT ID': 'شناسه گفتگو', 'TYPE': 'نوع', 'MEMBERS': 'اعضا', 'SIZE': 'اندازه', 'LAST ACTIVITY': 'آخرین فعالیت', '∅ no chats on this server': '∅ گفتگویی روی این سرور نیست', 'group': 'گروه', 'direct': 'خصوصی',
    'BACKEND': 'محل ذخیره', 'PROVIDER': 'ارائه‌دهنده', 'local filesystem': 'فایل‌سیستم محلی', 's3-compatible': 'سازگار با S3', 'attachments volume': 'حجم پیوست‌ها', 'USAGE PER USER': 'مصرف هر کاربر',
    'LARGEST FILES': 'بزرگ‌ترین فایل‌ها', '∅ no stored files': '∅ فایلی ذخیره نشده', 'encrypted blobs · size only, no names or types': 'داده‌های رمزگذاری‌شده · فقط اندازه، بدون نام یا نوع', 'ORPHAN CLEANUP': 'پاک‌سازی فایل‌های یتیم',
    'scan': 'اسکن', 'scanning…': 'در حال اسکن…', 'test storage': 'آزمایش ذخیره‌ساز', 'test connection': 'آزمایش اتصال', 'testing…': 'در حال آزمایش…', 'not tested yet': 'هنوز آزمایش نشده', 'send test email': 'ارسال ایمیل آزمایشی',
    'IDENTITY': 'هویت', 'SERVER NAME': 'نام سرور', 'WELCOME MESSAGE': 'پیام خوش‌آمد', 'DEFAULT CLIENT THEME': 'پوسته پیش‌فرض برنامه', 'LIMITS': 'محدودیت‌ها', 'PUSH': 'اعلان‌ها',
    'max upload size': 'حداکثر حجم بارگذاری', 'max group size': 'حداکثر اعضای گروه', 'rate limit': 'محدودیت نرخ', 'members': 'عضو', 'msg/min': 'پیام/دقیقه', 'invite': 'با دعوت', 'closed': 'بسته',
    'SIGN-UP FIELDS': 'فیلدهای ثبت‌نام', 'USER CAPABILITIES': 'توانایی‌های کاربر', 'off = hidden in the chat app': 'خاموش = در برنامه چت پنهان', 'ALWAYS ON': 'همیشه روشن', 'VISIBLE': 'قابل مشاهده',
    'ALWAYS REQUIRED': 'همیشه الزامی', 'password': 'گذرواژه', 'phone number': 'شماره تلفن', 'user reports': 'گزارش کاربران', 'auto-hide message': 'پنهان‌سازی خودکار پیام', 'reporter identity': 'هویت گزارش‌دهنده',
    'unique handle · how contacts find you': 'شناسه یکتا · راه یافتن شما', 'min 8 chars · hashed with argon2id': 'حداقل ۸ نویسه · درهم‌سازی با argon2id', 'shown as a contact handle · no sms verification': 'به‌عنوان شناسه نمایش داده می‌شود · بدون تأیید پیامکی',
    'users can flag messages to the reports queue': 'کاربران می‌توانند پیام‌ها را به صف گزارش بفرستند', 'admins see who reported': 'مدیران گزارش‌دهنده را می‌بینند',
    'edit sent messages': 'ویرایش پیام ارسال‌شده', 'edit window': 'مهلت ویرایش', 'delete own messages': 'حذف پیام‌های خود', 'forward messages': 'هدایت پیام‌ها', 'send attachments': 'ارسال پیوست', 'create groups': 'ساخت گروه',
    'senders can change a message after sending': 'فرستنده پس از ارسال می‌تواند پیام را تغییر دهد', 'removes the message for everyone in the chat': 'پیام را برای همه اعضای گفتگو حذف می‌کند',
    'photos, files and voice · upload limit applies': 'عکس، فایل و صدا · محدودیت حجم اعمال می‌شود', 'when off, only admins can create groups': 'وقتی خاموش است فقط مدیران گروه می‌سازند', 'always': 'همیشه',
    'MAINTENANCE MODE': 'حالت نگهداری', 'clients are shown a maintenance screen; admins stay signed in': 'کاربران صفحه نگهداری را می‌بینند؛ مدیران وارد می‌مانند', 'message shown to users': 'پیامی که کاربران می‌بینند',
    'revert': 'بازگردانی', 'save changes': 'ذخیره تغییرات', '● unsaved changes': '● تغییرات ذخیره نشده', '✓ all changes saved': '✓ همه تغییرات ذخیره شد',
    'COMPOSE': 'نوشتن', 'LEVEL': 'سطح', 'SEND': 'ارسال', 'CLIENT PREVIEW': 'پیش‌نمایش در برنامه', 'HISTORY': 'تاریخچه', 'schedule': 'زمان‌بندی', 'publish to all users': 'انتشار برای همه کاربران', 'info': 'اطلاع', 'warn': 'هشدار',
    'your announcement appears here, pinned above the chat list.': 'اطلاعیه شما این‌جا، بالای فهرست گفتگوها سنجاق می‌شود.',
    '↓ export csv': '↓ خروجی CSV', 'TIME': 'زمان', 'ACTOR': 'انجام‌دهنده', 'ACTION': 'کار', 'TARGET': 'هدف', 'IP': 'IP', '∅ no entries match these filters': '∅ موردی با این فیلترها نیست',
    'auth': 'ورود', 'config': 'پیکربندی',
    'ADMIN ACCOUNTS': 'حساب‌های مدیر', '+ promote user': '+ ارتقای کاربر', 'IP ALLOW-LIST': 'فهرست IP مجاز', 'empty list — console reachable from any IP': 'فهرست خالی — کنسول از هر IP در دسترس است',
    'ADMIN SESSIONS': 'نشست‌های مدیر', '[THIS]': '[همین]', '[ENABLED]': '[فعال]', 'BACKUPS': 'پشتیبان‌ها', '↓ download latest': '↓ دریافت آخرین نسخه', 'run now': 'اجرا',
    'ENGINE': 'موتور', 'CONNECTION': 'اتصال', 'TLS / SSL MODE': 'حالت TLS / SSL', 'local json': 'JSON محلی', 'sqlite': 'SQLite', 'postgresql': 'PostgreSQL', 'mysql / mariadb': 'MySQL / MariaDB',
    'json keeps everything in memory and rewrites one file. single process only — not for production.': 'JSON همه‌چیز را در حافظه نگه می‌دارد و یک فایل را بازنویسی می‌کند. فقط تک‌فرایندی — مناسب محیط عملیاتی نیست.',
    'HOST': 'میزبان', 'PORT': 'درگاه', 'USER ': 'کاربر', 'POOL SIZE': 'اندازه مخزن اتصال', 'FILE PATH': 'مسیر فایل', 'DIRECTORY': 'پوشه', 'ENDPOINT': 'نقطه دسترسی', 'REGION': 'منطقه', 'BUCKET': 'باکت',
    'ACCESS KEY ID': 'شناسه کلید دسترسی', 'SECRET ACCESS KEY': 'کلید مخفی', 'FROM NAME': 'نام فرستنده', 'FROM ADDRESS': 'نشانی فرستنده', 'show secrets': 'نمایش رمزها', 'hide secrets': 'پنهان‌کردن رمزها',
    'write-ahead log (WAL)': 'گزارش پیش‌نویس (WAL)', 'faster reads while writing': 'خواندن سریع‌تر هنگام نوشتن', 'path-style urls': 'نشانی به سبک مسیر', 'needed for minio and most self-hosted s3': 'برای MinIO و بیشتر S3های خودمیزبان لازم است',
    'OUTGOING EMAIL': 'ایمیل خروجی', 'outgoing email': 'ایمیل خروجی', 'verification, password reset and admin alerts': 'تأیید، بازنشانی گذرواژه و هشدارهای مدیر',
    'without email, users recover accounts with their recovery phrase only. email fields are stored but never verified.': 'بدون ایمیل، کاربران فقط با عبارت بازیابی حساب را برمی‌گردانند. ایمیل‌ها ذخیره ولی تأیید نمی‌شوند.',
    'SERVER': 'سرور', 'TEST': 'آزمایش', 'none': 'هیچ', 'email verification': 'تأیید ایمیل', 'password reset': 'بازنشانی گذرواژه', 'admin alerts': 'هشدارهای مدیر', 'email 2fa codes': 'کد دومرحله‌ای ایمیلی',
    'POLICY': 'سیاست', 'TRUST A DEVICE FOR': 'اعتماد به دستگاه برای', 'ask every time': 'هر بار بپرس', '7 days': '۷ روز', '30 days': '۳۰ روز', 'admins': 'مدیران', 'console sign-in': 'ورود به کنسول',
    'chat app sign-in': 'ورود به برنامه چت', 'backup codes': 'کدهای پشتیبان', '8 one-time codes for lost devices': '۸ کد یک‌بارمصرف برای دستگاه گم‌شده', 'email codes': 'کد ایمیلی',
    'YOUR AUTHENTICATOR': 'احراز هویت شما', 're-enroll authenticator': 'ثبت دوباره احراز هویت', 'generate backup codes': 'ساخت کدهای پشتیبان', 'regenerate backup codes': 'ساخت دوباره کدهای پشتیبان',
    'old codes stopped working': 'کدهای قبلی از کار افتادند', 'ADOPTION': 'میزان استفاده', 'FIRST ADMIN': 'نخستین مدیر', "this account owns the server. it can't be demoted or deleted by other admins.": 'این حساب مالک سرور است و مدیران دیگر نمی‌توانند آن را تنزل یا حذف کنند.',
    "next: you'll scan a 2FA code before the console opens.": 'گام بعد: پیش از باز شدن کنسول، کد دومرحله‌ای را اسکن می‌کنید.', 'EMAIL (OPTIONAL)': 'ایمیل (اختیاری)', 'CONFIRM PASSWORD': 'تکرار گذرواژه',
    'REVIEW': 'بازبینی', 'REVIEW →': 'بازبینی ←', 'LAUNCH SERVER →': 'اجرای سرور ←', 'server': 'سرور', 'email': 'ایمیل', '2fa': 'دومرحله‌ای', 'owner': 'مالک', 'launch': 'اجرا', 'registration': 'ثبت‌نام',
    'LABEL (ADMIN ONLY)': 'برچسب (فقط مدیر)', 'MAX USES': 'حداکثر استفاده', 'STORAGE QUOTA FOR NEW ACCOUNTS': 'سهمیه فضای حساب‌های تازه', 'server default': 'پیش‌فرض سرور', 'generate code': 'ساخت کد',
    'NEW INVITE': 'دعوت تازه', 'INVITE READY': 'دعوت آماده است', 'admin approval': 'تأیید مدیر', 'new accounts wait for approval before they can chat': 'حساب‌های تازه پیش از گفتگو منتظر تأیید می‌مانند',
    'show in invite link preview': 'نمایش در پیش‌نمایش پیوند', 'link preview shows server name and welcome message': 'پیش‌نمایش پیوند نام سرور و پیام خوش‌آمد را نشان می‌دهد',
    '/ search username': '/ جستجوی نام کاربری', '/ filter actor, target, ip': '/ فیلتر انجام‌دهنده، هدف، IP', 'e.g. design team, conference': 'مثلاً تیم طراحی، همایش',
    'e.g. scheduled upgrade tonight at 23:00 UTC — expect a 5 minute reconnect.': 'مثلاً ارتقای برنامه‌ریزی‌شده امشب ساعت ۲۳:۰۰ — حدود ۵ دقیقه قطعی.',
    'delete forever': 'حذف همیشگی', 'delete account': 'حذف حساب', 'remove admin': 'برداشتن مدیر', 'api': 'API', 'websocket': 'وب‌سوکت', 'push gateway': 'درگاه اعلان', 'blob storage': 'ذخیره‌ساز فایل', 'smtp': 'SMTP',
    'not configured': 'پیکربندی نشده', 'web push (VAPID)': 'اعلان وب (VAPID)', 'APNs relay': 'رله APNs', '[CONFIGURED]': '[پیکربندی‌شده]', '[DEGRADED]': '[ضعیف]', '[NOT SET]': '[تنظیم نشده]', 'enabled': 'فعال',
    'scan with': 'اسکن با', 'about': 'درباره', 'version · updates · source code': 'نسخه · به‌روزرسانی · کد منبع', 'updates': 'به‌روزرسانی‌ها', 'UPDATES': 'به‌روزرسانی‌ها',
    'check for updates': 'بررسی به‌روزرسانی', 'checking…': 'در حال بررسی…', 'release notes ↗': 'یادداشت‌های انتشار ↗', 'source code': 'کد منبع', '// credits': '// سازندگان', 'last checked: never': 'آخرین بررسی: هرگز',
    '░░░ asking github…': '░░░ پرسش از گیت‌هاب…', 'ABOUT': 'درباره', 'check for updates in health': 'بررسی به‌روزرسانی در بخش سلامت'
  };
  const P = [
    [/^(\d+)m ago$/, '$1 دقیقه پیش'], [/^(\d+)h ago$/, '$1 ساعت پیش'], [/^(\d+)d ago$/, '$1 روز پیش'], [/^(\d+)s$/, '$1 ثانیه'], [/^(\d+) min$/, '$1 دقیقه'], [/^(\d+) h$/, '$1 ساعت'], [/^(\d+) ?MB$/, '$1 مگابایت'],
    [/^last seen (.+)$/, 'آخرین بازدید $1'], [/^connected to (.+)$/, 'متصل به $1'], [/^resolving (.+)$/, 'در حال یافتن $1'], [/^step (\d+)\/(\d+)$/, 'مرحله $1/$2'], [/^step (\d+) of (\d+)$/, 'مرحله $1 از $2'],
    [/^rotates in (\d+)s$/, 'تعویض تا $1 ثانیه'], [/^(\d+) open reports$/, '$1 گزارش باز'], [/^(\d+) total$/, '$1 در کل'], [/^(\d+) active$/, '$1 فعال'], [/^(\d+) selected$/, '$1 انتخاب‌شده'],
    [/^(\d+) active sessions$/, '$1 نشست فعال'], [/^(\d+) accounts$/, '$1 حساب'], [/^(\d+) open$/, '$1 باز'], [/^uptime (.+)$/, 'کارکرد $1'], [/^last login (.+)$/, 'آخرین ورود $1'],
    [/^reply to (.+)$/, 'پاسخ به $1'], [/^editing (.+)$/, 'ویرایش $1'], [/^warn @(.+)$/, 'هشدار به @$1'], [/^no users match "(.*)"$/, 'کاربری با «$1» پیدا نشد'], [/^(\d+)–(\d+) of (\d+)$/, '$1–$2 از $3'],
    [/^admin \/ (.+)$/, 'مدیریت / $1'], [/^setup \/ (.+)$/, 'راه‌اندازی / $1'], [/^first-run setup · step (\d+) of (\d+)$/, 'راه‌اندازی نخست · مرحله $1 از $2'], [/^role: (.+) ↻$/, 'نقش: $1 ↻'],
    [/^\/\/ (\d+) MEMBERS$/, '// $1 عضو'], [/^\/\/ MEMBERS — (\d+) SELECTED$/, '// اعضا — $1 انتخاب‌شده'], [/^(\d+) left$/, '$1 باقی‌مانده'], [/^downloading (\d+)%$/, 'در حال دریافت $1٪'],
    [/^(.+) · muted$/, '$1 · بی‌صدا'], [/^forwarded from (.+)$/, 'هدایت‌شده از $1'], [/^↪ forwarded from (.+)$/, '↪ هدایت‌شده از $1'], [/^INVITE TO (.+)$/, 'دعوت به $1'], [/^(\d+) users$/, '$1 کاربر']
  ];
  const FA_DIG = '۰۱۲۳۴۵۶۷۸۹';
  const toFa = s => s.replace(/\d/g, d => FA_DIG[d]);
  const hasFa = s => /[\u0600-\u06FF]/.test(s);
  const numeric = s => /^[\d\s:.,\/%+\-–·×()]+$/.test(s) && /\d/.test(s);
  function tr(s) {
    const t = s.trim(); if (!t) return null;
    let out = Object.prototype.hasOwnProperty.call(D, t) ? D[t] : null;
    if (out == null) for (const [re, rp] of P) if (re.test(t)) { out = t.replace(re, rp); break; }
    if (out == null) { if (numeric(t)) out = toFa(t); else return null; }
    else if (hasFa(out)) out = out.replace(/(^|[^A-Za-z@#_\-.\/:])(\d+)/g, (m, a, d) => a + toFa(d));
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return lead + out + trail;
  }
  const TXT = new WeakMap(), ATT = new WeakMap(), ATTRS = ['placeholder', 'title', 'aria-label'];
  let on = false, root = null, obs = null;
  const skip = el => !el || el.closest && el.closest('script,style,textarea,[data-no-tr]');
  function doText(n) {
    if (skip(n.parentElement)) return;
    const cur = n.nodeValue, rec = TXT.get(n);
    if (rec && cur === rec.fa) return;
    const fa = tr(cur);
    if (fa != null && fa !== cur) { TXT.set(n, { en: cur, fa }); n.nodeValue = fa; }
    // Untranslated Latin text (sizes, paths, versions) keeps its own direction inside the right-to-left layout.
    else if (/[A-Za-z]/.test(cur) && n.parentElement.childNodes.length === 1) n.parentElement.setAttribute('data-bidi', '');
  }
  function doAttr(el, a) {
    const cur = el.getAttribute(a); if (!cur) return;
    const m = ATT.get(el) || {}; if (m[a] && m[a].fa === cur) return;
    const fa = tr(cur); if (fa != null && fa !== cur) { m[a] = { en: cur, fa }; ATT.set(el, m); el.setAttribute(a, fa); }
  }
  function walk(node) {
    if (node.nodeType === 3) return doText(node);
    if (node.nodeType !== 1 || skip(node)) return;
    ATTRS.forEach(a => node.hasAttribute(a) && doAttr(node, a));
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else ATTRS.forEach(a => n.hasAttribute(a) && doAttr(n, a)); }
  }
  function restore(node) {
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) {
      if (n.nodeType === 3) { const r = TXT.get(n); if (r && n.nodeValue === r.fa) n.nodeValue = r.en; TXT.delete(n); }
      else { const m = ATT.get(n); if (m) { for (const a in m) if (n.getAttribute(a) === m[a].fa) n.setAttribute(a, m[a].en); ATT.delete(n); } }
    }
  }
  return {
    add(o, pats = []) { Object.assign(D, o); P.unshift(...pats); },
    set(el, lang) {
      const want = lang === 'fa';
      if (want === on && el === root) return;
      if (obs) { obs.disconnect(); obs = null; }
      if (on && root) restore(root);
      on = want; root = el;
      if (!on) return;
      walk(el);
      obs = new MutationObserver(ms => { for (const m of ms) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttr(m.target, m.attributeName);
        else m.addedNodes.forEach(walk);
      } });
      obs.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
  };
})();
export default GSFA;
