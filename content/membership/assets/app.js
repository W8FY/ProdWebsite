document.addEventListener("DOMContentLoaded", function () {

    const search = document.getElementById("search");

    search.addEventListener("keyup", function () {

        let filter = this.value.toUpperCase();

        let rows = document.querySelectorAll("#memberTable tbody tr");

        rows.forEach(function (row) {

            let text = row.innerText.toUpperCase();

            if (text.indexOf(filter) > -1) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }

        });

    });

});