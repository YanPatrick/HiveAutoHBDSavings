# HiveAutoHBDSavings

For the project to work properly, you need to open the `.env` file (you can use Notepad or Notepad++) and enter your username and your active key.

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
