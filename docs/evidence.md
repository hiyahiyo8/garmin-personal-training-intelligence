# Evidence register

Dashboard memisahkan data Garmin, metrik turunan, dan interpretasi. Hasilnya mendukung refleksi latihan; bukan diagnosis, prediksi cedera, atau pengganti penilaian klinis.

## Prinsip yang diterapkan

| Prinsip | Dasar ilmiah | Implementasi produk |
|---|---|---|
| Session-RPE untuk internal load | Haddad M et al. (2017), *Frontiers in Neuroscience*. DOI: 10.3389/fnins.2017.00612 | `durasi × session-RPE` diprioritaskan jika pengguna mengisi check-in setelah latihan |
| Internal dan external load perlu konteks | Bourdon PC et al. (2017), *International Journal of Sports Physiology and Performance*. DOI: 10.1123/IJSPP.2016-0428 | Durasi, jarak, frekuensi, HR, jenis sesi, dan respons subjektif ditampilkan terpisah |
| Monitoring subjektif sensitif terhadap perubahan beban | Saw AE et al. (2016), *British Journal of Sports Medicine*. DOI: 10.1136/bjsports-2015-094758 | Check-in menyimpan RPE, pain, soreness, fatigue, kualitas tidur, stress, dan mood |
| Sleep pada atlet perlu pendekatan individual | Walsh NP et al. (2021), *British Journal of Sports Medicine*. DOI: 10.1136/bjsports-2020-102025 | Durasi, kebutuhan, dan skor tidur ditampilkan sebagai tren; tidak diubah menjadi satu keputusan otomatis |
| HRV harus dibandingkan dengan baseline personal | Düking P et al. (2021), *International Journal of Sports Physiology and Performance*. DOI: 10.1123/ijspp.2020-0894 | HRV semalaman ditampilkan bersama baseline Garmin dan rata-rata tujuh hari |
| Akurasi wearable bergantung pada metrik dan aktivitas | Evenson KR et al. (2020), *Journal of Medical Internet Research*. PMID: 32601613 | Dashboard menampilkan confidence data dan tidak memakai kalori sebagai estimasi konsumsi energi presisi |
| Perubahan cadence tidak memiliki target universal | Anderson LM et al. (2022), *Sports Medicine - Open*. PMID: 36057913 | Running dynamics dibandingkan secara intra-individu pada pace yang mendekati, tanpa target cadence 180 |
| Distribusi intensitas bersifat individual | Rosenblat MA et al. (2022), *Sports Medicine*. PMID: 34749417; Filipas L et al. (2025), PMID: 39888556 | CSV hanya memberi klasifikasi dominan sesi dari average HR/RPE; tidak memaksakan rasio 80/20 |
| ACWR tidak membuktikan hubungan kausal dengan cedera | Impellizzeri FM et al. (2020), *Sports Medicine*. PMID: 32502973 | Perubahan load ditampilkan secara deskriptif; dashboard tidak menghasilkan skor risiko cedera |
| Heart-rate recovery bergantung pada protokol | Cole CR et al. (1999), *NEJM*. PMID: 10536127; Shetler K et al. (2001), *JACC*. PMID: 11701939 | Dashboard hanya menghitung penurunan HR satu menit bila FIT merekam HR saat berhenti dan 55-75 detik sesudahnya; tidak memberi diagnosis atau ambang klinis |
| HR-speed decoupling menggambarkan durability dalam aktivitas berkepanjangan | Glaister M et al. (2026), exploratory half-marathon study. PMID: 42137179 | Pa:HR ditampilkan sebagai proxy observasional dan hanya bila speed/HR time-series memadai |

## Aturan analitik

- HR proxy hanya dipakai untuk aktivitas aerobik yang dapat diinterpretasikan dari HR. Breathwork dan strength tidak diberi load dari HR tanpa session-RPE.
- Average HR dari CSV tidak dianggap sebagai time-in-zone. Time-in-zone hanya dihitung dari record HR bertimestamp dalam FIT; jeda lebih dari 10 detik tidak diimputasi.
- Pa:HR drift ditampilkan sebagai proxy deskriptif dari perubahan rasio speed/HR antara paruh pertama dan kedua. Nilai hanya dihitung untuk sesi minimal 20 menit dengan speed dan HR memadai; perubahan terrain, cuaca, berhenti, dan sensor dapat memengaruhi hasil.
- Recovery HR 60 detik hanya dihitung bila FIT berisi HR saat timer berhenti dan record 55-75 detik sesudahnya. Data yang tidak tersedia ditampilkan sebagai kosong, bukan diestimasi.
- Running dynamics dibandingkan pada sesi dengan pace dalam rentang sekitar ±15% dari kelompok terbaru. Perubahan diberi konteks, bukan label biomekanik baik atau buruk.
- Sleep dan HRV tidak digabung menjadi readiness score. Pain check-in dan gejala aktual memiliki prioritas lebih tinggi daripada metrik wearable.
- Perubahan volume mingguan bukan prediksi cedera dan tidak menggunakan aturan kenaikan universal 10% atau 30%.

## Keterbatasan data saat ini

- Activities CSV hanya berisi ringkasan per sesi. FIT menambahkan time-series untuk time-in-zone dan metrik respons HR; deteksi interval terstruktur belum diterapkan.
- RPE tidak tersedia di export Garmin ini; pengguna perlu mengisinya lewat check-in.
- Resting HR harian dan Body Battery pagi belum tersedia dalam kumpulan CSV saat ini.
- Garmin VO₂max, fitness age, Training Effect, dan Body Battery adalah estimasi/proprietary metrics, bukan pengukuran laboratorium.
- Hubungan antara sleep, HRV, load, pace, dan keluhan bersifat observasional dan tidak membuktikan sebab-akibat.

## Sumber utama

- https://pubmed.ncbi.nlm.nih.gov/29163016/
- https://pubmed.ncbi.nlm.nih.gov/26423706/
- https://pubmed.ncbi.nlm.nih.gov/33144349/
- https://pubmed.ncbi.nlm.nih.gov/34639599/
- https://pubmed.ncbi.nlm.nih.gov/32601613/
- https://pubmed.ncbi.nlm.nih.gov/36057913/
- https://pubmed.ncbi.nlm.nih.gov/32502973/
- https://pubmed.ncbi.nlm.nih.gov/39888556/
- https://pubmed.ncbi.nlm.nih.gov/10536127/
- https://pubmed.ncbi.nlm.nih.gov/11701939/
- https://pubmed.ncbi.nlm.nih.gov/42137179/
