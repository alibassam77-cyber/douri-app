const translations = {
    ar: {
        app_title: "عيادة | Clinic",
        doctors_btn: "الأطباء",
        all_cities: "كل المدن",
        search_placeholder: "اسم الطبيب أو التخصص...",
        my_bookings_title: "حجوزاتي النشطة",
        back_to_search: "العودة للبحث",
        your_ticket_number: "رقم دورك",
        status_waiting: "في الانتظار",
        status_your_turn: "حان دورك الآن!",
        status_one_left: "بقي مريض واحد",
        ahead_label: "أمامك",
        wait_time_label: "دقيقة انتظار",
        eta_label: "الوقت المتوقع",
        welcome_msg: "أهلاً",
        ticket_hint: "شاشة التذكرة تتحدث تلقائياً.",
        back_to_bookings: "العودة لقائمة حجوزاتي",
        cancel_booking_btn: "إلغاء هذا الحجز",
        confirm_booking_title: "تأكيد الحجز",
        full_name_label: "الاسم الكامل:",
        name_placeholder: "اكتب اسمك هنا",
        phone_label: "رقم الهاتف:",
        phone_placeholder: "مثال: 777123456",
        confirm_btn: "تأكيد الحجز",
        cancel_btn: "إلغاء",
        doctor_portal_title: "بوابة الأطباء",
        login_tab: "دخول",
        register_tab: "حساب طبيب جديد",
        email_label: "البريد الإلكتروني:",
        password_label: "كلمة المرور:",
        password_min_label: "كلمة المرور (6 أحرف على الأقل):",
        remember_me: "تذكرني",
        login_btn: "تسجيل الدخول",
        doctor_name_label: "اسم الطبيب:",
        doc_name_ph: "مثال: د. أحمد",
        specialty_label: "التخصص:",
        specialty_ph: "مثال: باطنية، أطفال...",
        city_label: "المدينة:",
        city_ph: "مثال: صنعاء",
        street_label: "الشارع / الحي:",
        street_ph: "مثال: حدة - شارع تعز",
        map_location_label: "موقع العيادة (اضغط على الخريطة):",
        create_account_btn: "إنشاء الحساب وحفظ العيادة",
        at_doctor: "عند: "
    },
    en: {
        app_title: "Clinic | عيادة",
        doctors_btn: "Doctors",
        all_cities: "All Cities",
        search_placeholder: "Doctor name or specialty...",
        my_bookings_title: "My Active Bookings",
        back_to_search: "Back to Search",
        your_ticket_number: "Your Ticket Number",
        status_waiting: "Waiting",
        status_your_turn: "It's your turn!",
        status_one_left: "One patient left",
        ahead_label: "Ahead",
        wait_time_label: "Min Wait",
        eta_label: "Expected Time",
        welcome_msg: "Welcome",
        ticket_hint: "Ticket updates automatically.",
        back_to_bookings: "Back to My Bookings",
        cancel_booking_btn: "Cancel Booking",
        confirm_booking_title: "Confirm Booking",
        full_name_label: "Full Name:",
        name_placeholder: "Enter your name",
        phone_label: "Phone Number:",
        phone_placeholder: "Example: 777123456",
        confirm_btn: "Confirm Booking",
        cancel_btn: "Cancel",
        doctor_portal_title: "Doctor Portal",
        login_tab: "Login",
        register_tab: "New Doctor Account",
        email_label: "Email:",
        password_label: "Password:",
        password_min_label: "Password (min 6 chars):",
        remember_me: "Remember me",
        login_btn: "Login",
        doctor_name_label: "Doctor Name:",
        doc_name_ph: "Example: Dr. Ahmed",
        specialty_label: "Specialty:",
        specialty_ph: "Example: Internal, Pediatrics...",
        city_label: "City:",
        city_ph: "Example: Sanaa",
        street_label: "Street / District:",
        street_ph: "Example: Hadda - Taiz St.",
        map_location_label: "Clinic Location (Click on map):",
        create_account_btn: "Create Account & Save Clinic",
        at_doctor: "At: "
    }
};

let currentLang = localStorage.getItem('douri_lang') || 'ar';

function applyLanguage() {
    const dict = translations[currentLang];
    
    // تغيير اتجاه الصفحة
    if (currentLang === 'ar') {
        document.documentElement.setAttribute('dir', 'rtl');
        document.documentElement.setAttribute('lang', 'ar');
        document.getElementById('langToggleBtn').innerText = 'EN';
    } else {
        document.documentElement.setAttribute('dir', 'ltr');
        document.documentElement.setAttribute('lang', 'en');
        document.getElementById('langToggleBtn').innerText = 'عربي';
    }

    // ترجمة النصوص العادية
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) {
            el.innerText = dict[key];
        }
    });

    // ترجمة النصوص داخل الحقول (Placeholders)
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[key]) {
            el.setAttribute('placeholder', dict[key]);
        }
    });
    
    // تحديث عنوان الصفحة
    document.title = dict.app_title;
}

function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('douri_lang', currentLang);
    applyLanguage();
    
    // تحديث قائمة المدن لأن كلمة "كل المدن" تحتاج ترجمة
    if(typeof filterDoctors === 'function') {
        filterDoctors();
    }
}
