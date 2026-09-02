# واجباتي

تطبيق واجبات عربي RTL مبني بـ Next.js وSupabase.

## التشغيل

1. انسخ `.env.example` إلى `.env` وأضف مفاتيح Supabase.
2. طبّق migration داخل مجلد `supabase/migrations`.
3. أنشئ المدير الأول مرة واحدة:

```bash
curl -X POST http://localhost:3000/api/setup/initial-admin -H "x-setup-secret: SECRET"
```

4. شغّل التطبيق:

```bash
npm run dev
```

## الفحوصات

```bash
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
```
