# HiveAutoHBDSavings

For the project to work properly, you need to open the `.env` file (you can use Notepad or Notepad++) and enter your username and your active key.

The program will check if there is a payment for any post on yesterday's date (Today -1) or today's date.

The HBD value of each post will only be deposited once into savings, as in this process it is possible to configure a memo. This memo will be the key to prevent the HBD value of this post from being deposited in the savings account more than once every time the file checks for a post.

---
### ⚠️ WARNING
**Be very careful when handling your active key!**
Only put it in the `.env` file and **never share it with anyone**!

---

### 🛠️ `.env` configuration

Fill in the variables with your data:

```env
HIVE_USERNAME=your_hive_user
HIVE_ACTIVE_KEY=your_private_key
HBD_SEND_MODE=1 # 0 for fixed value, 1 for percentage
HBD_PERCENT_VALUE=30 # variable to set the % if the mode is percentage
HBD_FIX_VALUE=1 # variable to define the value to transfer if the mode is fixed
