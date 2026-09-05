# Shotcraft — App Store & Play Store Screenshot Studio

Mağaza ekran görüntülerini tasarlayıp App Store ve Google Play'in istediği **tüm ölçülerde** tek tıkla ZIP olarak indiren web uygulaması.

Kurulum yok, derleme yok, internet bağımlılığı yok (yazı tipleri hariç). Sadece HTML + CSS + JavaScript.

---

## Nasıl çalıştırılır

**En kolay yol:** `start.bat` dosyasına çift tıkla. Tarayıcı otomatik açılır.

Kapatmak için açılan siyah pencerede `Ctrl+C`.

Elle çalıştırmak istersen bu klasörde:

```
py -m http.server 8123
```

sonra tarayıcıda `http://localhost:8123`

> Not: `index.html` dosyasına doğrudan çift tıklamak **çalışmaz** — tarayıcılar `file://` üzerinden JavaScript modüllerine izin vermez. Mutlaka yerel sunucu üzerinden aç.

---

## Kullanım

0. **Projeler** — üst bardaki listeden uygulamalar arasında geç. `New` yeni proje, `Duplicate` mevcut tasarımı kopyalar (yeni uygulamaya aynı stili taşımanın en hızlı yolu), `Rename` / `Delete`. Her proje kendi ekranlarını, stilini ve seçili ölçülerini ayrı tutar.

1. **Screens** (sol kolon) — her kutu bir mağaza görselidir. `+ Add` ile ekle, sürükleyerek sırala, `Copy` / `Del` ile çoğalt/sil. İlk iki ekran mavi çizgiyle işaretlidir: kullanıcıların çoğu daha aşağı kaydırmaz, satışı o ikisi yapar.
2. **Import screenshots…** — telefondan aldığın ham ekran görüntülerini topluca seç. Dosya adına göre sıralanır ve sırayla ekranlara dağıtılır. **Önizlediğin cihaz sınıfının** slotuna yerleşir.
   Tek tek eklemek için: **Screenshots** bölümündeki `Add`, tuvale sürükle-bırak, ya da `Ctrl+V`.

   Her ekranın **üç görsel slotu** vardır: Phone, Tablet, Desktop. iPad ölçüsü ihraç ettiğinde iPad slotundaki görsel ve iPad çerçevesi kullanılır. Slot boşsa telefon görseline düşer ve panel bunu sana söyler.
3. **Content** — başlık ve alt başlık yaz. `Enter` satır kırar.
   Beş ekranın metnini tek seferde yazmak için sol üstteki **Write all** düğmesi: her satırda küçük önizleme, kelime sayacı ve okunabilirlik işareti. Yazdıkça tuval güncellenir, `Esc` kapatır.
4. **Style** — önce bir **Starter set** seç: beş ekranlık tam bir kurgu (yerleşim ritmi + renk + her ekrana ne yazılacağını söyleyen başlık iskeleti). Ekran görüntülerin yerinde kalır, `Ctrl+Z` geri alır.
   Altında **Colour theme** ile paleti, sonra arka planı, yazı tipini ve renkleri ayarlarsın. Stil **tüm ekranlar için ortaktır**, tek yerden değişir.
5. **Device** — her cihaz sınıfı için ayrı çerçeve (telefon: iPhone/Android, tablet: iPad, masaüstü: Laptop), çerçeve rengi, boyut, konum, döndürme, gölge.
   **Status bar** — ham ekran görüntündeki %47 pil ve operatör adının üstüne temiz bir 9:41 çubuğu bindirir. `Auto` görselin rengine bakıp ikon rengini kendi seçer. Sadece telefon çerçevelerinde çalışır.
6. **Cihazı yerleştirme** — cihazı doğrudan tuval üzerinde sürükle, mavi noktadan boyutlandır, çift tıkla sıfırla. Slider'lar da duruyor, ince ayar için.
7. **Badge** — ekranın üstüne `★ 4.8 · 12.000 ebeveyn` gibi bir sosyal kanıt etiketi koyar. Dönüşüme en çok dokunan tek görsel öğedir; genelde sadece 1. ekrana konur.

8. **Export** — hangi ölçüleri istediğini işaretle, **Download ZIP**.

### Search results — actual size

Tuvalin altındaki şerit, görsellerini mağaza arama sonuçlarında göründükleri **gerçek küçük boyutta** gösterir. Yanındaki etiket üç şeyi denetler:

- başlık o boyutta kaç piksel kalıyor (7.5 pikselin altı okunmaz),
- kaç kelime (5'i geçmemeli),
- başlık ile arka plan arasındaki kontrast (3:1'in altı yetersiz).

Yeşil "Reads well at store size" yazana kadar uğraş — mağaza arama sonucunda okunmayan bir başlık hiç yazılmamış sayılır. `Store preview` düğmesiyle şeridi gizleyebilirsin.

### Kısayollar

| Tuş | İş |
|---|---|
| `←` `→` | Ekranlar arası geçiş |
| `Ctrl+V` | Panodaki görseli o anki slota yapıştır |
| `Ctrl+Z` | Geri al |
| `Esc` | Write all penceresini kapat |
| Tuvalde sürükle | Cihazı taşı |
| Tuvalde çift tık | Cihaz konumunu sıfırla |

Proje tarayıcıda otomatik kaydedilir, sekmeyi kapatsan da durur.

---

## Çıktı yapısı

ZIP içinde her ölçü için ayrı klasör, dosyalar yükleme sırasına göre numaralı:

```
My App/
  App Store/
    6.9 iPhone 1290x2796/
      01.png
      02.png
      03.png
    13 iPad 2064x2752/
      ...
  Google Play/
    Phone 1080x1920/
      ...
```

Bu klasörleri App Store Connect ve Play Console'a olduğu gibi sürükleyebilirsin.

---

## Desteklenen ölçüler

**App Store** — 6.9" / 6.7" / 6.5" / 6.1" / 5.5" iPhone (+ yatay), 13" / 12.9" / 11" iPad (+ yatay)
**Mac App Store** — 1280×800, 1440×900, 2560×1600, 2880×1800
**Google Play** — Telefon (1080×1920, 1440×2560, yatay), 7" ve 10" tablet, Feature Graphic 1024×500

`required` etiketli olanlar mağazanın zorunlu tuttuklarıdır. "Required only" düğmesi sadece onları seçer.

Yeni ölçü eklemek için: `js/presets.js` içindeki `PRESETS` listesine bir satır ekle, gerisi kendiliğinden çalışır.

---

## İnternete yayınlama

Bu klasörün tamamını olduğu gibi yükle — build adımı yok:

- **Netlify Drop** (netlify.com/drop) — klasörü sürükle, saniyeler içinde canlı.
- **Vercel** veya **GitHub Pages** — aynı şekilde statik site olarak.

Tüm işlem kullanıcının tarayıcısında olur; sunucu maliyeti yok, görseller hiçbir yere yüklenmez.

---

## Dosyalar

| Dosya | İşi |
|---|---|
| `index.html` | Arayüz iskeleti |
| `css/style.css` | Görünüm |
| `js/presets.js` | Mağaza ölçüleri, cihaz çerçeveleri, yazı tipleri |
| `js/render.js` | Canvas çizim motoru — önizleme ve dışa aktarım aynı kodu kullanır |
| `js/store.js` | Proje durumu, çoklu proje deposu, şablonlar, görsel deposu (IndexedDB) |
| `js/zip.js` | ZIP oluşturucu |
| `js/app.js` | Arayüz bağlantıları, dışa aktarım akışı |
| `_selftest.html` | Geliştirici testi — `http://localhost:8123/_selftest.html` |

Çizim motoru **çözünürlükten bağımsızdır**: her ölçü `min(genişlik, yükseklik)` oranına göre hesaplanır, bu yüzden 430px'lik önizleme ile 2796px'lik çıktı birebir aynı görünür.

---

## Sırada ne var

Satışa etki edenler: panorama arka plan (tek arka plan beş ekrana yayılır), yerelleştirme (dil başına klasör), A/B varyant setleri, işaretleme öğeleri (ok, balon), 512×512 ikon + Feature Graphic üreteci.

Kolaylaştıranlar: proje yedeği (dışa/içe aktarma — **şu an en büyük veri kaybı riski bu**), uyarıların yanına "Düzelt" düğmesi, ekran görüntüsünden otomatik renk paleti, akıllı içe aktarma (en-boy oranından slot ve çerçeve seçimi), kendi markanı şablon olarak kaydetme, görünür geri/ileri düğmeleri.

**AI** sekmesi şu an bağlı değil, bağlanma noktası hazır. Planlanan:

- Uygulama açıklamasından başlık/alt başlık setleri üretmek
- Uygulama ikonundan renk paleti çıkarmak
- Biten seti tüm mağaza dillerine çevirmek
- Ekran sıralaması önerisi

---

## Bilinen sınırlar

- Sıkıştırma yapılmadan ZIP üretilir (PNG zaten sıkışık olduğu için sorun değil).
- Çok sayıda büyük ölçü seçilirse ZIP birkaç yüz MB olabilir; gerekirse **JPEG** formatına geç.
- Görseller tarayıcının IndexedDB'sinde durur; tarayıcı verilerini temizlersen kaybolur. (Proje yedeği dışa aktarma henüz yok.)
- Durum çubuğu yalnızca telefon çerçevelerinde çizilir; tablet ve masaüstünde atlanır.
