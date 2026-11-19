var translations = {
    ar: {
        app_title: 'دوري',
        app_subtitle: 'نظام حجز وطوابير العيادات',
        my_bookings_btn: 'حجوزاتي',
        restore_btn: 'استعادة بالرمز السري',
        doctors_portal_btn: 'الأطباء',
        search_placeholder: 'ابحث باسم الطبيب أو التخصص...',
        city_placeholder: 'اختر أو اكتب المدينة...',
        my_bookings_title: 'حجوزاتي النشطة',
        back_to_search: 'العودة للبحث',
        ticket_title: 'تذكرة الحجز',
        back_btn: 'رجوع',
        your_ticket_label: 'رقم دورك',
        people_ahead_label: 'أمامك',
        wait_time_label: 'الانتظار التقريبي (دقائق)',
        eta_label: 'الوقت المتوقع',
        copy_secret_btn: 'نسخ الرمز السري',
        cancel_booking_btn: 'إلغاء الحجز',
        patient_name_label: 'اسم المريض',
        patient_phone_label: 'رقم الهاتف',
        confirm_booking_btn: 'تأكيد الحجز',
        close_btn: 'إغلاق',
        choose_clinic_title: 'اختر العيادة',
        doctors_portal_title: 'بوابة الأطباء',
        admin_subtitle: 'إدارة طابور الانتظار والعيادات',
        currently_serving_label: 'الدور الحالي',
        no_results: 'لا توجد عيادات مطابقة للبحث.',
        closed_temp: 'مغلق مؤقتاً',
        available: 'متاح',
        on_break: 'في استراحة',
        book_now: 'احجز الآن',
        view_map: 'عرض على الخريطة',
        hours_label: 'ساعات العمل:',
        choose_clinic_btn: 'اختر العيادة',
        at_doctor: 'لدى ',
        tomorrow: 'غداً ',
        active_booking_msg: 'لديك {n} حجز نشط حالياً — اضغط لعرض التذكرة',
        no_bookings: 'لا توجد حجوزات نشطة حالياً.',
        appointment_date: 'تاريخ الموعد:',
        your_number: 'رقم دورك:',
        view_ticket: 'عرض التذكرة',
        invalid_booking: 'الرمز السري غير صحيح أو الحجز غير موجود.',
        secret_prompt: 'أدخل الرمز السري المكون من 12 رقماً لاستعادة حجذك:',
        old_booking_warning: 'هذا الحجز لا يحتوي على رمز سري لاستعادته.',
        booking_done: 'تم إنهاء الموعد',
        booking_cancelled: 'تم إلغاء الحجز',
        status_your_turn: 'حان دورك الآن',
        status_one_left: 'مريض واحد أمامك',
        status_waiting: 'في الانتظار',
        copy_success: 'تم نسخ الرمز السري بنجاح.',
        close_clinic: 'إغلاق العيادة',
        open_clinic: 'فتح العيادة',
        serial_label: 'الرقم التسلسلي:',
        no_patients: 'لا يوجد مرضى في قائمة الانتظار لهذا اليوم.',
        status_serving: 'قيد الكشف الآن',
        status_waiting_admin: 'ينتظر'
    }
};

function getCurrentLang() {
    return localStorage.getItem('douri_lang') || 'ar';
}

function t(key) {
    var lang = getCurrentLang();
    var dict = translations[lang] || translations.ar;
    return dict[key] || translations.ar[key] || key;
}

function applyLanguage() {
    var lang = getCurrentLang();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    var textNodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < textNodes.length; i++) {
        var el = textNodes[i];
        var key = el.getAttribute('data-i18n');
        if (key) el.innerText = t(key);
    }

    var placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < placeholders.length; j++) {
        var inp = placeholders[j];
        var pKey = inp.getAttribute('data-i18n-placeholder');
        if (pKey) inp.setAttribute('placeholder', t(pKey));
    }
}
