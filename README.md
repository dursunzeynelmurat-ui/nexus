# nexus

Bu repo, ana uygulama kodunu `nexus---professional-whatsapp-management-&-automation/` klasöründe barındırır.

## Çalıştırma

```bash
cd nexus---professional-whatsapp-management-&-automation
npm install
npm run dev
```

## Ortam değişkenleri

- `GEMINI_API_KEY` **zorunlu değil** (mevcut kodda Gemini API çağrısı yok).
- Admin panelini kullanacaksanız aşağıdakileri ekleyin:
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`
  - `ADMIN_TOKEN_SECRET`

## Production deployment

- Bu proje AWS EC2 üzerinde yayınlanmak üzere hazırlanmıştır (Nginx + PM2).
- Hostinger sadece domain/DNS yönetimi için kullanılmalıdır.
- Detaylı adımlar için: `nexus---professional-whatsapp-management-&-automation/README.md`.
