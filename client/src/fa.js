// Farsi strings the chat app adds on top of the design's dictionary (counts, presence and newer copy).
import GSFA from '#shared/core/i18n.js';

GSFA.add({
  'BIO': 'بیوگرافی', 'INFO': 'اطلاعات', 'LOG IN': 'ورود', 'PHONE': 'تلفن', 'SELECTED': 'انتخاب‌شده', '// MEMBERS —': '// اعضا —',
  'add contact': 'افزودن مخاطب', 'groups': 'گروه‌ها', 'hidden by privacy settings': 'پنهان به‌خاطر تنظیمات حریم خصوصی',
  'no account? create one': 'حساب ندارید؟ یکی بسازید', 'not signed in': 'وارد نشده', 'this browser': 'همین مرورگر', 'total': 'کل',
  '· change': '· تغییر', '· usernames are permanent': '· نام کاربری قابل تغییر نیست', 'browser · unknown': 'مرورگر · ناشناخته',
  '// add people first: search an @username on the chats tab.': '// اول افراد را اضافه کنید: در زبانه گفتگوها یک ‎@نام‌کاربری جستجو کنید.',
  'message — @ to mention_': 'پیام — با @ نام ببرید_', 'message_': 'پیام_', 'edit message_': 'ویرایش پیام_', 'add a caption_': 'افزودن توضیح_',
  '// others find you as': '// دیگران شما را این‌طور پیدا می‌کنند:', '// visible to:': '// قابل مشاهده برای:',
}, [
  // system lines in a conversation (they contain names, so they're matched as patterns)
  [/^you created #(.+)$/, 'شما گروه «$1» را ساختید'], [/^(.+) created #(.+)$/, '$1 گروه «$2» را ساخت'],
  [/^\+ (.+) added by you$/, '+ $1 را شما اضافه کردید'], [/^\+ (.+) added by (.+)$/, '+ $1 را $2 اضافه کرد'],
  [/^(.+) joined via invite link$/, '$1 با لینک دعوت پیوست'], [/^(?!\d+ left$)(.+) left$/, '$1 گروه را ترک کرد'],
  [/^(\d+) msgs$/, '$1 پیام'], [/^(\d+) members$/, '$1 عضو'], [/^(\d+) members · (\d+) msgs$/, '$1 عضو · $2 پیام'],
  [/^(\d+) chats · (\d+) online$/, '$1 گفتگو · $2 آنلاین'], [/^sign out (\d+) other sessions?$/, 'خروج از $1 نشست دیگر'],
  [/^last seen recently$/, 'اخیراً آنلاین بوده'], [/^last seen (\d+)m ago$/, 'آخرین بازدید $1 دقیقه پیش'],
  [/^last seen (\d+)h ago$/, 'آخرین بازدید $1 ساعت پیش'], [/^last seen (\d+)d ago$/, 'آخرین بازدید $1 روز پیش'],
  [/^\/\/ share your handle @(\S+) on (\S+) to get started\.$/, '// برای شروع، شناسه ‎@$1 را در $2 به اشتراک بگذارید.'],
]);
