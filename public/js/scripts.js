

(function () {
    'use strict';
    window.addEventListener(
      'load',
      function () {
        var forms = document.getElementsByClassName('needs-validation');
        var validation = Array.prototype.filter.call(forms, function (form) {
          form.addEventListener(
            'submit',
            function (event) {
              if (form.checkValidity() === false) {
                event.preventDefault();
                event.stopPropagation();
              }
              form.classList.add('was-validated');
            },
            false
          );
        });
      },
      false
    );
  })();
  

  document.addEventListener('DOMContentLoaded', function() {
    const decrementButton = document.getElementById('decrementDays');
    const incrementButton = document.getElementById('incrementDays');
    const travelDaysInput = document.getElementById('travelDays');

    decrementButton.addEventListener('click', () => {
      let currentValue = parseInt(travelDaysInput.value);
      if (currentValue > parseInt(travelDaysInput.min)) {
        travelDaysInput.value = currentValue - 1;
      }
    });

    incrementButton.addEventListener('click', () => {
      let currentValue = parseInt(travelDaysInput.value);
      if(currentValue<(travelDaysInput.max)){
        travelDaysInput.value = currentValue + 1;
      }
    });
  });


  document.addEventListener('DOMContentLoaded', function() {
    const departureDateInput = document.getElementById('departureDate');
  
    const today = new Date().toISOString().split('T')[0];
  
    departureDateInput.min = today;
  
  
    if (departureDateInput.value < today) {
        departureDateInput.value = today;
    }
  
    departureDateInput.addEventListener('change', function() {
      if (this.value < today) {
        this.value = today;
        alert("Past dates are disabled. Please select a date starting from today.");
      }
    });
  });


