# עטיפת Android (TWA) עבור קלפי ספרדית

תיקייה זו מכילה פרויקט Android ("Trusted Web Activity") שעוטף את אתר ה-PWA
בכתובת https://similan2000-alt.github.io/Spanish-learning-/ כאפליקציה נייטיבית
לצורך העלאה ל-Google Play.

## חשוב לדעת מראש

הפרויקט כאן **לא נבנה ולא נבדק בפועל** בסביבה שבה הוא נוצר, כי אין שם Android
SDK, ואין גישת רשת להורדת תלויות (Google Maven, Gradle) הנדרשות לבנייה.
המבנה תואם בדיוק את מה שכלי כמו [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
של גוגל מייצר, אבל מומלץ לוודא שהוא נבנה בהצלחה לפני הסתמכות עליו —
הכי קל לעשות זאת ב-Android Studio (ר' למטה) שיודע "לרפא" ולסנכרן את קבצי
ה-Gradle אוטומטית.

## שתי דרכים לבנות APK/AAB

### אפשרות א' (הכי פשוטה, מומלצת): Bubblewrap CLI

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest="https://similan2000-alt.github.io/Spanish-learning-/manifest.json"
```

זה ייצור פרויקט מוכן, כולל keystore חדש משלו, וישאל שאלות בסיסיות (שם
חבילה, צבעים וכו'). אח"כ:

```bash
bubblewrap build
```

מפיק קובץ `app-release-signed.apk` / `.aab` מוכן להעלאה.

### אפשרות ב': הפרויקט שמוכן כבר כאן + Android Studio

1. פותחים את התיקייה `android-twa/` ב-Android Studio ("Open").
2. Android Studio יסנכרן את ה-Gradle wrapper אוטומטית (כולל הורדת הגרסה
   הנכונה - זה דורש חיבור אינטרנט רגיל, לא הסביבה המוגבלת שבה זה נוצר).
3. Build → Generate Signed Bundle / APK.
4. משתמשים ב-keystore שנשלח אליכם בנפרד בצ'אט
   (`spanish-flashcards-release.keystore`, alias `spanish-flashcards`) —
   **שמרו אותו במקום בטוח, אי אפשר לעדכן אפליקציה שפורסמה בלי אותו קובץ בדיוק**.

## הגדרת Digital Asset Links (כדי שהאפליקציה תיפתח במסך מלא בלי שורת כתובת)

כדי ש-Android "יאמת" שהאפליקציה שלכם באמת הבעלים של האתר, וכך יוריד את
שורת הכתובת (URL bar) ויציג מסך מלא אמיתי, צריך לפרסם קובץ בשם
`assetlinks.json` (כבר מוכן כאן בתיקייה, עם ה-fingerprint של המפתח שנוצר)
בכתובת:

```
https://similan2000-alt.github.io/.well-known/assetlinks.json
```

**שימו לב**: זו כתובת ה-**שורש** של הדומיין `similan2000-alt.github.io`,
לא תת-הנתיב `/Spanish-learning-/` של האתר שלנו. ב-GitHub Pages, שורש הדומיין
הזה שייך אך ורק לריפו שנקרא בדיוק `similan2000-alt.github.io` (ריפו "משתמש"
מיוחד, לא ריפו "פרויקט" רגיל). כדי לפרסם שם:

1. אם אין לכם ריפו כזה — צרו ריפו חדש בשם המדויק `similan2000-alt.github.io`
2. הפעילו בו GitHub Pages (אותו תהליך שעשינו כאן)
3. שימו בו קובץ `.well-known/assetlinks.json` עם התוכן מהקובץ `assetlinks.json` שבתיקייה הזו

**זה שלב אופציונלי** — האפליקציה תעבוד ותיפתח גם בלעדיו, רק תוצג עם שורת
כתובת דפדפן למעלה (כמו Chrome Custom Tab) במקום מסך מלא "אמיתי".

## העלאה ל-Google Play

1. פותחים חשבון ב-[Google Play Console](https://play.google.com/console) (עלות חד-פעמית 25$)
2. יוצרים אפליקציה חדשה, ממלאים את פרטי החנות (שם, תיאור, צילומי מסך, מדיניות פרטיות)
3. מעלים את קובץ ה-`.aab` שנוצר
4. שולחים לבדיקה

## מבנה הפרויקט

```
android-twa/
  build.gradle, settings.gradle, gradle.properties   - הגדרות הפרויקט
  app/build.gradle                                    - הגדרות המודול, applicationId, גרסת androidbrowserhelper
  app/src/main/AndroidManifest.xml                     - מגדיר את כתובת ה-URL שהאפליקציה עוטפת
  app/src/main/res/                                    - שם, צבעים, אייקון
  assetlinks.json                                      - לפרסום ב-similan2000-alt.github.io (ר' מעלה)
```
