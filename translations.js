var translations = {
    ar: { 
        app_title: "عيادة", doctors_btn: "الأطباء", all_cities: "كل المدن", search_placeholder: "اسم الطبيب أو التخصص...", 
        no_results: "لا يوجد أطباء.", available: "متاح للحجز", closed_temp: "مغلق مؤقتاً", on_break: "استراحة", 
        book_now: "احجز الآن", clinic_location: "موقع العيادة", at_doctor: "عند: ", my_bookings_title: "حجوزاتي", 
        no_bookings: "لا يوجد حجوزات.", your_number: "رقم دورك:", view_ticket: "عرض التذكرة", back_to_search: "العودة للبحث", 
        your_ticket_number: "رقم دورك", status_waiting: "في الانتظار", status_your_turn: "حان دورك!", status_one_left: "بقي مريض واحد", 
        ahead_label: "أمامك", wait_time_label: "دقيقة", eta_label: "الوقت المتوقع", welcome_msg: "أهلاً", ticket_hint: "شاشة التذكرة تتحدث تلقائياً.", 
        back_to_bookings: "العودة", cancel_booking_btn: "إلغاء", confirm_booking_title: "تأكيد الحجز", full_name_label: "الاسم:", 
        name_placeholder: "اكتب اسمك هنا", phone_label: "رقم الهاتف:", phone_placeholder: "مثال: 777123456", confirm_btn: "تأكيد الحجز", cancel_btn: "إلغاء", 
        doctor_portal_title: "بوابة الأطباء", login_tab: "دخول", register_tab: "حساب طبيب جديد", email_label: "البريد الإلكتروني:", password_label: "كلمة المرور:", 
        password_min_label: "كلمة المرور (6 أحرف على الأقل):", remember_me: "تذكرني", login_btn: "تسجيل الدخول", doctor_name_label: "اسم الطبيب:", doc_name_ph: "مثال: د. أحمد", 
        specialty_label: "التخصص:", specialty_ph: "مثال: باطنية", city_label: "المدينة:", city_ph: "مثال: صنعاء", street_label: "الشارع:", street_ph: "مثال: حدة", 
        landmark_label: "علامة مميزة (مقابل/بجوار):", landmark_ph: "مثال: مقابل مستشفى...", 
        activation_code_label: "كود التفعيل (من الإدارة):", activation_code_ph: "أدخل الكود السري هنا", invalid_code: "كود التفعيل غير صحيح! تواصل مع الإدارة.",
        start_time_label: "وقت فتح العيادة:", end_time_label: "وقت إغلاق العيادة:", service_time_label: "مدة الكشف للمريض (بالدقائق):", create_account_btn: "إنشاء الحساب وحفظ العيادة", 
        active_booking_msg: "لديك {n} حجز نشط! اضغط هنا لعرضها", tomorrow: "غداً ", hours_label: "ساعات العمل:",
        admin_title: "لوحة تحكم العيادة", current_patient: "المريض الحالي (الذي عند الطبيب)", call_next: "نادِ المريض التالي", 
        close_clinic: "إغلاق العيادة (استراحة)", open_clinic: "فتح العيادة للاستقبال", reset_clinic: "تصفير العيادة بالكامل", 
        queue_title: "طابور الانتظار", no_patients: "لا يوجد مرضى في الانتظار حالياً.", status_serving: "عند الطبيب الآن", 
        status_waiting_admin: "في الانتظار"
    },
    en: { 
        app_title: "Clinic", doctors_btn: "Doctors", all_cities: "All Cities", search_placeholder: "Doctor name or specialty...", 
        no_results: "No doctors.", available: "Available", closed_temp: "Closed", on_break: "Break", 
        book_now: "Book Now", clinic_location: "Location", at_doctor: "At: ", my_bookings_title: "Bookings", 
        no_bookings: "No bookings.", your_number: "Number:", view_ticket: "View", back_to_search: "Back", 
        your_ticket_number: "Your Number", status_waiting: "Waiting", status_your_turn: "Your Turn!", status_one_left: "One left", 
        ahead_label: "Ahead", wait_time_label: "Min", eta_label: "ETA", welcome_msg: "Welcome", ticket_hint: "Ticket updates automatically.", 
        back_to_bookings: "Back", cancel_booking_btn: "Cancel", confirm_booking_title: "Confirm", full_name_label: "Name:", 
        name_placeholder: "Enter your name", phone_label: "Phone:", phone_placeholder: "Example: 777123456", confirm_btn: "Confirm", cancel_btn: "Cancel", 
        doctor_portal_title: "Doctor Portal", login_tab: "Login", register_tab: "New Doctor Account", email_label: "Email:", password_label: "Password:", 
        password_min_label: "Password (min 6 chars):", remember_me: "Remember me", login_btn: "Login", doctor_name_label: "Doctor Name:", doc_name_ph: "Example: Dr. Ahmed", 
        specialty_label: "Specialty:", specialty_ph: "Example: Internal", city_label: "City:", city_ph: "Example: Sanaa", street_label: "Street:", street_ph: "Example: Hadda", 
        landmark_label: "Landmark (Opposite/Near):", landmark_ph: "Example: Opposite hospital...", 
        activation_code_label: "Activation Code:", activation_code_ph: "Enter secret code", invalid_code: "Invalid activation code! Contact admin.",
        start_time_label: "Opening Time:", end_time_label: "Closing Time:", service_time_label: "Service Time (min):", create_account_btn: "Create Account & Save Clinic", 
        active_booking_msg: "You have {n} active booking(s)! Click here to view.", tomorrow: "Tmrw ", hours_label: "Hours:",
        admin_title: "Clinic Dashboard", current_patient: "Current Patient (with Doctor)", call_next: "Call Next Patient", 
        close_clinic: "Close Clinic (Break)", open_clinic: "Open Clinic", reset_clinic: "Reset Clinic", 
        queue_title: "Waiting Queue", no_patients: "No patients in queue.", status_serving: "With Doctor", 
        status_waiting_admin: "Waiting"
    }
};

var currentLang = localStorage.getItem('douri_lang') || 'ar';

function applyLanguage() {
    var dict = translations[currentLang];
    if (currentLang === 'ar') { 
        document.documentElement.setAttribute('dir', 'rtl'); 
        var langBtn = document.getElementById('langToggleBtn');
        if(langBtn) langBtn.innerText = 'EN'; 
    }
    else { 
        document.documentElement.setAttribute('dir', 'ltr'); 
        var langBtn = document.getElementById('langToggleBtn');
        if(langBtn) langBtn.innerText = 'عربي'; 
    }
    
    var elements = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < elements.length; i++) {
        var key = elements[i].getAttribute('data-i18n');
        if (dict[key]) elements[i].innerText = dict[key];
    }
    var placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < placeholders.length; j++) {
        var pKey = placeholders[j].getAttribute('data-i18n-placeholder');
        if (dict[pKey]) placeholders[j].setAttribute('placeholder', dict[pKey]);
    }
}

function toggleLanguage() { 
    currentLang = currentLang === 'ar' ? 'en' : 'ar'; 
    localStorage.setItem('douri_lang', currentLang); 
    window.location.reload(); 
}

function t(key) { 
    return translations[currentLang] && translations[currentLang][key] ? translations[currentLang][key] : key; 
}
