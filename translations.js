const translations = {
    ar: {
        app_title: "عيادة",
        doctors_btn: "الأطباء",
        all_cities: "كل المدن",
        search_placeholder: "اسم الطبيب أو التخصص...",
        no_results: "لا يوجد أطباء يطابقون بحثك.",
        available: "متاح للحجز",
        closed_temp: "مغلق مؤقتاً",
        on_break: "الطبيب في استراحة",
        book_now: "احجز الآن",
        clinic_location: "موقع العيادة",
        at_doctor: "عند: ",
        my_bookings_title: "حجوزاتي النشطة",
        no_bookings: "لا يوجد لديك حجوزات حالياً.",
        your_number: "رقم دورك:",
        view_ticket: "عرض التذكرة",
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
        admin_title: "لوحة تحكم العيادة",
        current_patient: "المريض الحالي (الذي عند الطبيب)",
        call_next: "نادِ المريض التالي",
        close_clinic: "إغلاق العيادة (استراحة)",
        open_clinic: "فتح العيادة للاستقبال",
        reset_clinic: "تصفير العيادة بالكامل",
        queue_title: "طابور الانتظار",
        no_patients: "لا يوجد مرضى في الانتظار حالياً.",
        status_serving: "عند الطبيب الآن",
        active_booking_msg: "لديك {n} حجز نشط! اضغط هنا لعرضها"
    },
    en: {
        app_title: "Clinic",
        doctors_btn: "Doctors",
        all_cities: "All Cities",
        search_placeholder: "Doctor name or specialty...",
        no_results: "No doctors match your search.",
        available: "Available",
        closed_temp: "Temporarily Closed",
        on_break: "Doctor on break",
        book_now: "Book Now",
        clinic_location: "Clinic Location",
        at_doctor: "At: ",
        my_bookings_title: "My Active Bookings",
        no_bookings: "No active bookings.",
        your_number: "Your Number:",
        view_ticket: "View Ticket",
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
        admin_title: "Clinic Dashboard",
        current_patient: "Current Patient (with Doctor)",
        call_next: "Call Next Patient",
        close_clinic: "Close Clinic (Break)",
        open_clinic: "Open Clinic",
        reset_clinic: "Reset Clinic",
        queue_title: "Waiting Queue",
        no_patients: "No patients in queue.",
        status_serving: "With Doctor",
        active_booking_msg: "You have {n} active booking(s)! Click here to view."
    }
};

let currentLang = localStorage.getItem('douri_lang') || 'ar';

function applyLanguage() {
    const dict = translations[currentLang];
    
    // تغيير اتجاه الصفحة
    if (currentLang === 'ar') {
        document.documentElement.setAttribute('dir', 'rtl');
        document.documentElement.setAttribute('lang', 'ar');
        if(document.getElementById('langToggleBtn')) document.getElementById('langToggleBtn').innerText = 'EN';
    } else {
        document.documentElement.setAttribute('dir', 'ltr');
        document.documentElement.setAttribute('lang', 'en');
        if(document.getElementById('langToggleBtn')) document.getElementById('langToggleBtn').innerText = 'عربي';
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

    // تحديث القائمة المنسدلة للمدن
    let citySelect = document.getElementById('cityFilter');
    if (citySelect && citySelect.options.length > 0) {
        citySelect.options[0].text = dict.all_cities;
    }

    // إذا كنا في لوحة العيادة، نحدث النصوص الديناميكية
    if(typeof updateClinicStatusUI === 'function') updateClinicStatusUI();
    if(typeof listenToQueue === 'function' && selectedDoctorId) {
        // إعادة تشغيل المستمع لتحديث الحالات
        listenToQueue();
    }
}

function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('douri_lang', currentLang);
    applyLanguage();
    
    // إعادة رسم الأطباء لترجمة البطاقات
    if(typeof filterDoctors === 'function') {
        filterDoctors();
    }
}
